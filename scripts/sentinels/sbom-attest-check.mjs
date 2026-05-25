#!/usr/bin/env node
/**
 * Sentinel: sbom-attest-check  (Lot P0 a11y/compliance — I-CMP6 / R11)
 *
 * Asserts the supply-chain SBOM-attestation contract across the three CI
 * workflows. Decision Q3 = "Tout faire" (design §D5-D7):
 *
 *   - ci-cd-backend.yml  — MUST gain a `cosign attest --type cyclonedx
 *     --predicate ... sbom.json` step bound to the pushed image digest
 *     (`steps.push.outputs.digest`), WITHOUT touching the existing
 *     `cosign sign --yes` + `actions/attest-build-provenance@v2` gates.
 *   - ci-cd-web.yml      — MUST gain `id-token: write` + `attestations: write`
 *     on the deploy job, a `@cyclonedx/cyclonedx-npm` SBOM step, and a
 *     `cosign attest --type cyclonedx` step.
 *   - ci-cd-mobile.yml   — MUST gain a `@cyclonedx/cyclonedx-npm` SBOM step +
 *     an `actions/upload-artifact` for it, and MUST NOT add `cosign attest`
 *     (EAS `--no-wait` exposes no OCI image digest to CI — documented residual
 *     in TECH_DEBT, design §D7).
 *
 * Exit 0 = the contract holds (post-impl). Exit 1 = any assertion fails
 * (pre-impl: web+mobile have zero cyclonedx/cosign; BE has no `cosign attest
 * --type cyclonedx`). The non-zero pre-impl exit is the RED proof of this lot.
 *
 * Pure-Node text assertions — no new dependency, no YAML parser (structural
 * string checks against the workflow source text).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const WF_DIR = path.join(repoRoot, '.github', 'workflows');

function read(file) {
  const abs = path.join(WF_DIR, file);
  if (!fs.existsSync(abs)) {
    return { ok: false, missing: true, text: '' };
  }
  return { ok: true, missing: false, text: fs.readFileSync(abs, 'utf8') };
}

const failures = [];
function check(label, condition, hint) {
  if (!condition) failures.push({ label, hint });
}

// ── Backend ───────────────────────────────────────────────────────────────────
const be = read('ci-cd-backend.yml');
if (be.missing) {
  failures.push({ label: 'ci-cd-backend.yml missing', hint: 'expected at .github/workflows/' });
} else {
  // New attest step: cosign attest --type cyclonedx with a predicate sbom.json,
  // bound to the pushed image digest.
  const hasCosignAttestCyclonedx =
    /cosign\s+attest\b[^\n]*--type\s+cyclonedx/.test(be.text) &&
    /--predicate[^\n]*sbom\.json/.test(be.text);
  check(
    'BE: `cosign attest --type cyclonedx --predicate ... sbom.json` step present',
    hasCosignAttestCyclonedx,
    'add the CycloneDX attest step in deploy-prod AFTER the SLSA attest step (design §D5)',
  );
  check(
    'BE: attest references the pushed image digest (steps.push.outputs.digest)',
    hasCosignAttestCyclonedx && /steps\.push\.outputs\.digest/.test(be.text),
    'attest the image by digest, not by tag',
  );
  // Existing signing gates MUST remain intact (additive constraint).
  check(
    'BE: existing `cosign sign --yes` gate still present (unchanged)',
    /cosign\s+sign\s+--yes/.test(be.text),
    'do NOT remove the existing cosign sign step',
  );
  check(
    'BE: existing SLSA `actions/attest-build-provenance@v2` still present (unchanged)',
    /actions\/attest-build-provenance@v2/.test(be.text),
    'do NOT remove the existing SLSA provenance attestation',
  );
}

// ── Web ─────────────────────────────────────────────────────────────────────
const web = read('ci-cd-web.yml');
if (web.missing) {
  failures.push({ label: 'ci-cd-web.yml missing', hint: 'expected at .github/workflows/' });
} else {
  check(
    'Web: deploy job declares `id-token: write`',
    /id-token:\s*write/.test(web.text),
    'add id-token: write to the deploy job permissions (keyless OIDC, design §D6)',
  );
  check(
    'Web: deploy job declares `attestations: write`',
    /attestations:\s*write/.test(web.text),
    'add attestations: write to the deploy job permissions',
  );
  check(
    'Web: `@cyclonedx/cyclonedx-npm` SBOM-gen step present',
    /@cyclonedx\/cyclonedx-npm/.test(web.text),
    'add a CycloneDX SBOM-gen step in the web deploy job',
  );
  check(
    'Web: `cosign attest --type cyclonedx` step present',
    /cosign\s+attest\b[^\n]*--type\s+cyclonedx/.test(web.text),
    'attest the web image SBOM with cosign (continue-on-error advisory)',
  );
}

// ── Mobile ────────────────────────────────────────────────────────────────────
const mobile = read('ci-cd-mobile.yml');
if (mobile.missing) {
  failures.push({ label: 'ci-cd-mobile.yml missing', hint: 'expected at .github/workflows/' });
} else {
  check(
    'Mobile: `@cyclonedx/cyclonedx-npm` SBOM-gen step present',
    /@cyclonedx\/cyclonedx-npm/.test(mobile.text),
    'add a CycloneDX SBOM-gen step over the JS bundle deps (design §D7)',
  );
  check(
    'Mobile: an `actions/upload-artifact` for the mobile SBOM present',
    /actions\/upload-artifact/.test(mobile.text) && /sbom-mobile/.test(mobile.text),
    'upload the generated sbom-mobile.json as a CI artifact',
  );
  // Documented residual: NO cosign attest on mobile (no OCI digest from EAS).
  check(
    'Mobile: does NOT use `cosign attest` (no image digest from EAS --no-wait)',
    !/cosign\s+attest/.test(mobile.text),
    'mobile attestation is a documented TECH_DEBT residual — do NOT add cosign attest',
  );
}

// ── Verdict ────────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log('[sbom-attest-check] ✓ SBOM attestation contract holds (BE + Web + Mobile)');
  process.exit(0);
}

console.error(
  `[sbom-attest-check] ✗ ${String(failures.length)} SBOM-attestation assertion(s) failing:\n`,
);
for (const f of failures) {
  console.error(`  • ${f.label}`);
  if (f.hint) console.error(`      fix: ${f.hint}`);
}
console.error('\n[sbom-attest-check] decision Q3 = "Tout faire" (design §D5-D7). See docs/TECH_DEBT.md.');
process.exit(1);
