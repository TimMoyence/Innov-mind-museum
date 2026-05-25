# Full Audit 2026-05-25 — orchestration /team (échelle maximale, read-only fan-out)

> Branche `dev` @ `89852f2a1`. 62 commits depuis 2026-05-21 (961 fichiers). Demande user : 3 tâches + rapport prof + ticks roadmap + priorisation + commit.
> Méthode : fresh-context agents (UFR-022), read-only, max 5/vague (REGLE 12). Cross-validation 2 angles/cluster (UFR-025). Honnêteté path:line obligatoire (UFR-013/024).

## Phase A — Réalité roadmap (verdicts par item, rafraîchis vs commits du jour)
Calque la structure D1-D8 (8 domaines) + extension NOW/NEXT. 9 agents.
- A1 P0.A Security (A1-A9)
- A2 P0.I.A I-SEC (I-SEC1-12)
- A3 P0.B GDPR (B1-B19)
- A4 P0.C Feature-gates (C1-C9) + I-FIX1-3
- A5 P0.I.B I-OPS stabilité (I-OPS1-8) + LOT4
- A6 P0.I.C I-CMP a11y/compliance (I-CMP1-6) — #298 du jour
- A7 P0.D burial/honnêteté (D1-D5) + TD-AS-01 — PR#299 + 15abcc94d du jour
- A8 P0.F clusters shipped (re-vérif échantillon C/W)
- A9 NOW V1.0.x + NEW smalls résiduels

## Phase B — Review qualité par cluster (2 agents/cluster, angles croisés)
Angle 1 = correctness/architecture/hexagonal/DRY. Angle 2 = sécurité/a11y/tests/honnêteté/perf.
- B1 Backend DRY helpers sweep (PR-1..16)
- B2 Web refactor phases 1-4 (#R5/R17/F1/F2, BaseModal, useFetchData, apiPut)
- B3 Chat frontend (composer crash, leading buttons, bottom-sheet-router, SSE burial, sendMessageSmart)
- B4 P0 Security lot #293
- B5 P0 GDPR lot #294
- B6 P0 Feature-gates lot #295
- B7 a11y P0 lot #298 (du jour)
- B8 Burial + storage lot (PR#299 + TD-AS-01, du jour)
- B9 Deploy/dev-stack fixes (smoke layers, seed idempotent, bake-key)

## Phase C — E2E feature tracing (entrée → data, 1 agent/feature, gitnexus+grep)
- C1 chat (photo→LLM→response→carnet)
- C2 auth (register/login/TOTP/OAuth/delete/DSAR)
- C3 museum (geofence/QR/onboarding/choice)
- C4 daily-art
- C5 paywall/quota/tier
- C6 knowledge-extraction (catalog ingest/SigLIP/pgvector/image-compare)
- C7 review + support (tickets/moderation/NPS)
- C8 admin + telemetry (stats/RBAC/Plausible funnel)
- C9 leads (B2B signup/Brevo)
- C10 FE features cluster (conversation/onboarding/home/settings/legal/diagnostics/art-keywords)

## Sorties
- phase-a-roadmap/A{1..9}.md · phase-b-diffs/B{1..9}-{angle}.md · phase-c-e2e/C{1..10}.md
- REPORT.md (rapport prof) · roadmap-ticks.md (changements roadmap proposés)
