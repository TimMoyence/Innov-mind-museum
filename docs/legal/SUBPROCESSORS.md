# Sub-Processors — pointer

**Canonical inventory:** [`docs/compliance/SUBPROCESSORS.md`](../compliance/SUBPROCESSORS.md).

This file is a discoverability stub. The Article 28 sub-processor ledger lives in `docs/compliance/` because that path co-locates the technical audit dossier (`DATA_FLOW_MAP.md`, `AI_ACT_CONFORMITY_MATRIX.md`, `art5-audit.md`, `FAIRNESS_METRICS_PLAN.md`) and is the citation target of both [`DPIA.md`](DPIA.md) and [`ROPA.md`](ROPA.md).

## Why two paths?

- `docs/legal/` — DPO-facing documents intended for legal counsel signature (DPIA, ROPA, accessibility statement).
- `docs/compliance/` — technical evidence binders cross-referenced by code (`SUBPROCESSORS.md` is bound to `museum-backend/src/config/env.ts` env vars; entries are verified against the actual endpoints called in production).

Moving the canonical file to `docs/legal/` would break the existing citations in DPIA, ROPA, and the audit dossier `team-reports/2026-04-26-security-compliance-full-audit.md`. The pointer here keeps both filing systems consistent.

## Quick links

- Canonical ledger: [`docs/compliance/SUBPROCESSORS.md`](../compliance/SUBPROCESSORS.md) — 20 entries, last reviewed 2026-04-26 (P0-3 DeepSeek consistency: kept as alternative, not active in EU prod by configuration `LLM_PROVIDER=openai`).
- Data flow map: [`docs/compliance/DATA_FLOW_MAP.md`](../compliance/DATA_FLOW_MAP.md).
- DPIA: [`DPIA.md`](DPIA.md) (this folder).
- ROPA: [`ROPA.md`](ROPA.md) (this folder).
- VDP runbook (incident response, GDPR + CRA): [`docs/operations/VDP_RUNBOOK.md`](../operations/VDP_RUNBOOK.md).

## Update protocol

When adding a sub-processor:

1. Edit `docs/compliance/SUBPROCESSORS.md` (the canonical file) **in the same PR** as the code change introducing the integration.
2. Update [`ROPA.md`](ROPA.md) row referencing the new sub-processor index.
3. Update [`DPIA.md`](DPIA.md) row 52 / 92 / 117 / equivalent if the new sub-processor receives personal data.
4. Re-read transfer mechanism (Art. 44-49 — SCC, DPF, adequacy) for the vendor's country.

---

Last updated: 2026-05-14.
