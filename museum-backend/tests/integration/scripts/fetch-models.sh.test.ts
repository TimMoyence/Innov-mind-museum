/**
 * T-A5 (RED — Wave A / C1 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the contract of `museum-backend/scripts/fetch-models.sh` (the
 * SigLIP-2 ONNX provisioning shell at Docker build time) :
 *
 *   (a) SIGLIP_ONNX_SHA256 set + URL 404      → exit ≠ 0 (fail-loud).
 *   (b) SIGLIP_ONNX_SHA256 UNSET + URL 404    → exit 0 + WARNING log
 *       (R-C1b — bucket-not-provisioned tolerance, runtime falls back to
 *       EMBEDDINGS_PROVIDER=replicate).
 *   (c) SIGLIP_ONNX_SHA256 set + payload SHA  → exit ≠ 0 (drift detected
 *       differs from EXPECTED                  on already-downloaded file).
 *
 * The shell logic IS correct today (verified spec.md §0 + design.md §3.C1).
 * This test adds the missing test coverage — historically there were ZERO
 * tests on the script, so any regression silently slipped through. With the
 * coverage in place, the editor (T-A10 green) can write the runbook without
 * fear of breaking the 3 branches.
 *
 * RED expectation here is nuanced :
 *   - File `fetch-models.sh.test.ts` does NOT exist today → adding it counts
 *     as a NEW RED test under UFR-022 (the suite gains a contract that was
 *     never enforced).
 *   - If the script behaves correctly, the 3 tests pass on the very first
 *     run. This is acceptable for a CONFIG-flavor task (T-A5 is documented
 *     in tasks.md:80-81 as "test PASS initialement si logique correcte" —
 *     proves non-régression R-C1/R-C1b).
 *   - If the script regresses (e.g. a future edit removes the unset-SHA
 *     tolerance), this test goes RED.
 *
 * Strategy : spawn `bash scripts/fetch-models.sh` with env overrides via
 * spawnSync. Use a non-routable URL (`http://127.0.0.1:1/...`) to force
 * curl to fail consistently across environments (no real network needed,
 * no flake under CI). The `--retry 3` baked into the script means each
 * branch takes ~6s wall-clock — we keep parallelism low to stay polite.
 */
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(BACKEND_ROOT, 'scripts/fetch-models.sh');

/**
 * Non-routable URL — `127.0.0.1:1` is a privileged port nobody listens on,
 * so curl fails with a TCP-level error (not even an HTTP 404 — the script
 * groups all non-success cases together, so the branch is the same).
 */
const UNREACHABLE_URL = 'http://127.0.0.1:1/musaium-siglip-test.onnx';

const SHA_SET = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

/** Run the script with deterministic env + isolated DEST dir. */
const runScript = (
  env: Record<string, string | undefined>,
  dest: string,
): ReturnType<typeof spawnSync> => {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      SIGLIP_ONNX_URL: UNREACHABLE_URL,
      SIGLIP_ONNX_DEST: dest,
      ...env,
    },
    encoding: 'utf8',
    // 60s — `--retry 3 --retry-delay 2` against an unreachable host takes
    // ~6-10s ; keep generous headroom for noisy CI.
    timeout: 60_000,
  });
  return result;
};

describe('fetch-models.sh — SigLIP provisioning contract (T-A5 — Wave A C1)', () => {
  jest.setTimeout(180_000);

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'musaium-fetch-models-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('branch (a) — SHA set + URL unreachable → exit non-zero (fail-loud)', () => {
    const dest = path.join(tmpDir, 'siglip-a.onnx');
    const result = runScript({ SIGLIP_ONNX_SHA256: SHA_SET }, dest);
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    // The exit status MUST be non-zero so the Docker build fails when a
    // bucket+SHA pair is pinned but the bucket is missing — that is the
    // explicit "production is configured" signal.
    expect(result.status).not.toBe(0);
    // Whatever curl/script wrote, the "download failed" message must surface
    // so operators see the cause in CI logs.
    expect(`${stdout}\n${stderr}`).toMatch(/download failed|exit/i);
  });

  it('branch (b) — SHA UNSET + URL unreachable → exit 0 with WARNING (R-C1b tolerance)', () => {
    const dest = path.join(tmpDir, 'siglip-b.onnx');
    const result = runScript({ SIGLIP_ONNX_SHA256: undefined }, dest);
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    // R-C1b — bucket-not-provisioned tolerance. The deploy MUST NOT fail
    // when no SHA pin is set, because EMBEDDINGS_PROVIDER=replicate covers
    // the runtime path. Exit 0 + a WARNING line is the contract.
    expect(result.status).toBe(0);
    expect(combined).toMatch(/WARNING/);
  });

  it('branch (c) — SHA set + pre-existing file with drift → exit non-zero (drift detected)', async () => {
    const dest = path.join(tmpDir, 'siglip-c.onnx');
    // Pre-populate DEST with a file whose actual sha256 will NOT equal
    // SHA_SET (deadbeef*64 is not a real hash of any sane payload). The
    // script's fast-path detects the drift and re-downloads ; the unreachable
    // URL then makes the re-download fail → exit 1.
    await fs.writeFile(dest, 'arbitrary-payload-with-some-hash-X');

    const result = runScript({ SIGLIP_ONNX_SHA256: SHA_SET }, dest);
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(result.status).not.toBe(0);
    // The drift detection log line should surface (proves the script took
    // the drift branch, not just a curl error from somewhere else).
    expect(combined).toMatch(/sha256 drift|sha256 mismatch|re-downloading|download failed/i);
  });
});
