# ADR-068 — SBOM attestation strategy across the 3 apps (digest-bound where possible; mobile gap deferred to CRA 2027)

**Status:** Accepted — implemented (advisory, non-blocking)
**Date:** 2026-05-25
**Deciders:** /team run `2026-05-25-p0-a11y-compliance` (dispatcher + architect + editor fresh-context UFR-022) ; user decision Q3 = "Tout faire"
**Scope:** CI/CD only — `.github/workflows/{ci-cd-backend,ci-cd-web,ci-cd-mobile}.yml`. No application code.
**Implemented in:** `ci-cd-backend.yml` (deploy-prod), `ci-cd-web.yml` (deploy), `ci-cd-mobile.yml` (quality). Contract guard: `scripts/sentinels/sbom-attest-check.mjs`.
**Tracking:** [`docs/TECH_DEBT.md` § TD-CMP6-SBOM-ATTEST](../TECH_DEBT.md) (residual mobile gap)
**Related design:** [`team-state/2026-05-25-p0-a11y-compliance/design.md`](../../.claude/skills/team/team-state/2026-05-25-p0-a11y-compliance/design.md) §D5–D7 ; spec.md §2 (I-CMP6)

---

## Context

The roadmap-reconstruction audit (`audit-state/2026-05-25-roadmap-reconstruction/findings/D5-lot5-a11y.md`) flagged I-CMP6: the deploy pipeline produced a CycloneDX SBOM for the backend (`ci-cd-backend.yml` quality job) but **never bound it to a signed, verifiable attestation tied to the shipped artifact's digest**. The existing supply-chain controls — `cosign sign` + `attest-build-provenance@v2` (SLSA provenance) + `cosign verify` + `gh attestation verify` on the backend image — were in place but undocumented at the decision level (no prior ADR), and the SBOM itself was an unsigned build by-product.

Forces at play:
- **Regulatory:** the EU Cyber Resilience Act (CRA, Regulation (EU) 2024/2847) Art. 13 mandates a machine-readable SBOM for products with digital elements; the main obligations apply from **11 December 2027** — *after* the V1 launch (2026-06-07). It is a binding future obligation, not a launch blocker.
- **Architectural asymmetry:** the backend and web are shipped as **OCI images** with a stable, CI-reachable digest (`steps.push.outputs.digest`) — a predicate can be signed and bound to that digest with `cosign attest`. The **mobile** app is built remotely by EAS (`eas build --no-wait`); the CI run has **no local OCI digest** for the store binary, so there is nothing for a signed predicate to reference.
- **Launch risk (J-13 to V1):** the existing `cosign sign` / SLSA provenance / verify steps already gate the prod deploy. Any new step that broke or blocked them would jeopardise the launch.

## Decision

Adopt a **digest-bound-where-possible, artifact-only-where-not** SBOM attestation posture (user decision Q3 = "Tout faire"):

- **Backend** — add `cosign attest --type cyclonedx` on `steps.push.outputs.digest`, in `deploy-prod`, **after** the existing `attest-build-provenance@v2`. The existing `cosign sign` / SLSA-attest / `cosign verify` / `gh attestation verify` steps are left **byte-unchanged** and still blocking.
- **Web** — grant the deploy job `id-token: write` + `attestations: write` (job-scoped, least-privilege), generate a CycloneDX SBOM, and `cosign attest --type cyclonedx` on the push digest (`id: push`).
- **Mobile** — generate the CycloneDX SBOM of the JS dependency graph and upload it as a CI artifact (`sbom-mobile`). **No** sigstore attestation, because EAS exposes no local OCI digest to bind a predicate to.

All three new steps are **additive and `continue-on-error: true` (advisory)** — they never gate a deploy that the pre-existing, still-blocking controls have already verified.

## Consequences

- **Positive:** backend + web ship signed, digest-bound CycloneDX attestations (verifiable via `cosign verify-attestation` / `gh attestation verify`). The supply-chain posture is now documented (this ADR) rather than living only in YAML. CRA-readiness materially advanced for 2/3 surfaces.
- **Negative / residual gap:** the **mobile store binary has no signed SBOM attestation bound to its digest** — the SBOM ships as an unsigned CI artifact only. This is the delta to close before **CRA Art. 13 (2027)**, tracked in **TD-CMP6**.
- **Neutral:** advisory (`continue-on-error`) means a transient attestation failure won't block a deploy — acceptable pre-launch (the blocking SLSA/sign controls remain authoritative); revisit hardening to blocking once the steps have baked.

## Alternatives considered

- **Block the deploy on the new SBOM-attest steps** — rejected: J-13 launch risk; the pre-existing SLSA/sign/verify chain is the authoritative gate, and an unproven advisory step must not be allowed to fail a deploy.
- **Defer all SBOM attestation to a post-launch lot (TD-only, no implementation now)** — rejected by the user (Q3 = "Tout faire"): the BE+web digest-bound case is cheap and additive, so there is no reason to defer the 2/3 surfaces that are trivially attestable.
- **Force a local digest for the mobile binary (e.g. mirror the EAS artifact into an OCI registry to obtain a digest)** — rejected for V1: speculative tooling work (4–8 h, EAS-side integration), not justified before the 2027 deadline; deferred and tracked in TD-CMP6.
- **No ADR, TECH_DEBT entry only** — rejected: this is a cross-cutting, direction-setting decision with a regulatory deadline and a deliberately accepted residual gap, and the prior supply-chain controls had no decision record at all. TD-CMP6 tracks the *remaining work*; this ADR records the *decision*.

## References

- TD-CMP6-SBOM-ATTEST — `docs/TECH_DEBT.md`
- Audit finding: `audit-state/2026-05-25-roadmap-reconstruction/findings/D5-lot5-a11y.md` (I-CMP6)
- Contract guard: `scripts/sentinels/sbom-attest-check.mjs`
- EU Cyber Resilience Act — Regulation (EU) 2024/2847, Art. 13 — SBOM obligations. Main obligations apply from **11 December 2027** (in force since 10 December 2024). https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng (accessed 2026-05-25).
- Workflows: `.github/workflows/ci-cd-backend.yml`, `ci-cd-web.yml`, `ci-cd-mobile.yml`
