/**
 * RED phase — make production DECIDABLE FROM THE REPO (R10), and prove no new
 * knob can bring the broken path back (R11).
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Cases: test-contract UC-43, UC-44 · spec AC-10/AC-11.
 *
 * THE OPERATIONAL HEART OF THE DRAMA. `OTEL_ENABLED` is documented NOWHERE in the
 * repository — `grep` finds `env.ts:267` and two prose docs, and that is all. So
 * "is production affected?" cannot be answered without SSHing into the VPS. The
 * local `.env` set it to `true`, which is why the outage was visible in dev at all.
 *
 * And the temptation on the way out is `OTEL_OPENAI_INSTRUMENTATION_ENABLED=true`
 * "just in case we want the spans back" — i.e. the bug, restored by an env var
 * (UFR-015 / C-1: no pre-launch feature flags). UC-44 makes that impossible to add
 * quietly; UC-5 proves, behaviourally, that no EXISTING variable can do it either.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const ENV_EXAMPLE = resolve(BACKEND_ROOT, '.env.example');
const ENV_TS = resolve(BACKEND_ROOT, 'src/config/env.ts');

const runNode = (script: string, cwd: string): { code: number; output: string } => {
  try {
    const stdout = execFileSync('node', [script], { cwd, encoding: 'utf8' });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}` };
  }
};

describe('UC-43 — .env.example makes the OTel switch visible from the repo', () => {
  const read = (): string => readFileSync(ENV_EXAMPLE, 'utf8');

  it('documents OTEL_ENABLED, OTEL_EXPORTER_ENDPOINT and OTEL_SERVICE_NAME', () => {
    const example = read();
    expect(example).toContain('OTEL_ENABLED');
    expect(example).toContain('OTEL_EXPORTER_ENDPOINT');
    expect(example).toContain('OTEL_SERVICE_NAME');
  });

  it('ships OTEL_ENABLED=false — the safe default, on every new dev environment', () => {
    const line = read()
      .split('\n')
      .find((l) => /^\s*#?\s*OTEL_ENABLED\s*=/.test(l));
    expect(line).toBeDefined();
    expect(line).toMatch(/OTEL_ENABLED\s*=\s*false\s*$/);
  });

  it('says that enabling it wires the auto-instrumentation bundle', () => {
    // Otherwise the variable reads like a harmless exporter toggle — which is
    // exactly how ~40 instrumentations, one of them fatal, got switched on.
    expect(read()).toMatch(/auto-instrumentation/i);
  });

  it('does not double the /v1/traces suffix (the silent-404 trap)', () => {
    // `opentelemetry.ts:33` concatenates `/v1/traces` onto the base. An example
    // ending in `/v1/traces` produces `/v1/traces/v1/traces` → a silent 404.
    const line = read()
      .split('\n')
      .find((l) => /^\s*#?\s*OTEL_EXPORTER_ENDPOINT\s*=/.test(l));
    expect(line).toBeDefined();
    expect(line ?? '').not.toMatch(/\/v1\/traces\s*$/);
  });

  it('keeps the env-policy sentinel green', () => {
    const run = runNode(resolve(REPO_ROOT, 'scripts/sentinels/env-policy.mjs'), REPO_ROOT);
    if (run.code !== 0) {
      throw new Error(`env-policy sentinel failed:\n${run.output}`);
    }
    expect(run.code).toBe(0);
  });
});

describe('UC-44 — no new button can restore the broken path', () => {
  it('src/config/env.ts is untouched by this run', () => {
    const diff = execFileSync('git', ['diff', 'HEAD', '--name-only', '--', ENV_TS], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(diff).toBe('');
  });

  it('src/ reads no OTel/instrumentation env var beyond the existing three', () => {
    // The policy is a programmatic map — priority 1 in the bundle's own resolution
    // order — precisely so that R11 is true BY CONSTRUCTION and not by discipline.
    // A new `process.env.OTEL_*` read in src/ would be a new way to break the chat.
    const hits = execFileSync(
      'bash',
      [
        '-lc',
        `grep -rnoE "process\\.env\\.[A-Z_]*(OTEL|INSTRUMENT)[A-Z_]*" src/ | sed -E 's/.*(process\\.env\\.[A-Z_]+).*/\\1/' | sort -u || true`,
      ],
      { cwd: BACKEND_ROOT, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((l) => l !== '');

    expect(hits.sort()).toEqual([
      'process.env.OTEL_ENABLED',
      'process.env.OTEL_EXPORTER_ENDPOINT',
      'process.env.OTEL_SERVICE_NAME',
    ]);
  });

  it('the sentinel policy seam is a CLI argument of a gate script, not an app env var', () => {
    // `--policy=<json>` exists so the bite-tests can present a doctored policy. It
    // lives in a gate script; it cannot re-enable an instrumentation in the running
    // application. If it were an env var read by src/, it WOULD be a new button.
    const sentinel = resolve(BACKEND_ROOT, 'scripts/sentinels/otel-instrumentation-roster.ts');
    const source = readFileSync(sentinel, 'utf8');
    expect(source).toContain('--policy=');

    const appReadsPolicyOverride = execFileSync(
      'bash',
      ['-lc', `grep -rl "policyOverride\\|--policy" src/ || true`],
      { cwd: BACKEND_ROOT, encoding: 'utf8' },
    ).trim();
    expect(appReadsPolicyOverride).toBe('');
  });
});
