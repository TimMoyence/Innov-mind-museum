# Ultrareview Fixes — PR #286

**Source** : `/ultrareview 286` run `r0wykavnv` (2026-05-16). 4 findings — 3 normal + 1 nit. Tous sur R1 soft-paywall.

**Méthodologie** : pipeline 4-rôles fresh-context (inspection → red → green → review → verify). Max 2 features in-flight. Cap 2 corrective loops. Pas de merge tant que validation user pas obtenue.

---

## Findings triagés

| ID | Sévérité | Surface | Fix scope | Business rule |
|---|---|---|---|---|
| **bug_001** | normal | BE chat-session route middleware ordering | Reserve+commit OU swap order avec validateBody | Mutating middlewares APRÈS validators short-circuit. Reserve+commit pour billing-adjacent state. |
| **bug_005** | normal | Mobile QuotaUpsellModal state persistence | Reset state sur visible transition (useEffect OU conditional mount OU key) | RN Modal avec host persistent : state local doit être remount-équivalent sur close/reopen. GDPR Art. 7 consent renewal. |
| **bug_010** | normal | Mobile resetAt display | Intl.DateTimeFormat sur ISO BE input | Date wire format = ISO. FE formate via Intl. Jamais raw ISO. (Spec R1 §3.4 D4 déjà mandate, jamais implémenté.) |
| **bug_013** | nit | BE loggedHits Set unbounded | Switch Set→Map\<userId, lastMonth\> | Backlog V1.1 — impact négligeable V1 (~6KB/an à 100 users) mais pattern textbook never-evicted cache. TECH_DEBT entry. |

---

## Pipeline features

| ID | Bug | Status | Spec | Owner | Notes |
|---|---|---|---|---|---|
| **F1** | bug_001 | `done` | [specs/F1.md](specs/F1.md) | green-code-agent-2026-05-16-F1-001 (fresh) | APPROVED loop 1 **weightedMean 92.8**. Commit `26a30424`. Breakdown : correctness 92 / scope 90 / kiss-dry 95 / a11y 100 (N/A) / security-honesty 88. 0 blockers. Nice-to-have : promote it.todo handler-5xx tail à test ACTIVE pinning (V1.1 trade-off visible CI), `docs/TECH_DEBT.md` entry, audit `dailyChatLimit` ordering, ESLint rule mechanizing pattern. |
| **F2** | bug_005 | `done` | [specs/F2.md](specs/F2.md) | green-code-agent-2026-05-16-F2-001 (fresh) | APPROVED loop 1 **weightedMean 95.25** (top score à ce jour). Commit `b6e4dd46`. Breakdown : correctness 94 / scope 100 / kiss-dry 92 / a11y 100 / security-honesty 91. 0 blockers. Nice-to-have : F2.AC4 breadcrumb cadence test (PaywallModalHost extraction), CLAUDE.md D1 options enum, TECH_DEBT V1.1 promote modal state à PaywallProvider, useLayoutEffect si Risk1 intra-frame paint observé. ESLint suppression LEGITIMATE (rule docs exempt parent-prop-driven subscribe pattern). |
| **F3** | bug_010 | `done` | [specs/F3.md](specs/F3.md) | green-code-agent-2026-05-16-F3-001 (fresh) | APPROVED loop 1 **weightedMean 92.15**. Commit `3cdebfe8`. Breakdown : correctness 90 / scope 100 / kiss-dry 87 / a11y 95 / security-honesty 90. 0 blockers. resetAtIso deviation = LEGITIMATE_WORKAROUND (probed indépendamment). T3 Hermes manual smoke = ACCEPTABLE_DEFER (two-layer fallback couvre worst-case = pre-fix behavior, pas régression). Nice-to-have : F3.AC4/5/7 supplemental tests, CLAUDE.md dateStyle:'long' + Hermes ICU context expansion, TECH_DEBT audit autres ISO-in-UI sites. |
| **F2** | bug_005 | `pending` | specs/F2.md | — | Mobile modal state reset + GDPR Art. 7 enforcement. |
| **F3** | bug_010 | `pending` | specs/F3.md | — | Mobile Intl.DateTimeFormat resetAt. Spec D4 enforcement. |
| **F4** | bug_013 | `deferred V1.1 (TD-12)` | — | dispatcher | `docs/TECH_DEBT.md` TD-12 ajouté avec fix sketch pattern (a) `Map<userId, lastLoggedMonth>`, effort 30 min, V1.1 backlog (renumbered from TD-11 post-merge collision with main TD-11 `@types/express-serve-static-core`). Reviewer ultrareview classé nit (~6 KB/an V1 scale, ~9 MB / 3 ans à 100k MAU). Discipline enterprise-grade : tech debt visible, fix sketch concret, pas de fix overkill. |

---

## Ordre de pioche

1. **F1 d'abord** (BE quota middleware, isolé, valide pipeline ultrareview-fix)
2. **F2** (Mobile modal state, isolé features/paywall/)
3. **F3** (Mobile resetAt, même file que F2 — sequential pour éviter collision sur QuotaUpsellModal.tsx)
4. F4 → `docs/TECH_DEBT.md` entry uniquement

---

## Business rules à doctriner (post-fix)

À ajouter dans `CLAUDE.md § Pièges connus` après merge :

1. **Middleware ordering doctrine** — quand un middleware MUTATE state (counter, audit, quota), il DOIT s'exécuter APRÈS les validators qui peuvent short-circuit (Zod 400). Sinon : counter inflation sur requests invalides. Pattern alternatif = reserve+commit (verify in middleware, increment dans handler après succès). Exemple : `monthlySessionQuota` (R1 corrective ultrareview F1).
2. **RN Modal persistent host doctrine** — quand `<Modal>` est hosté en permanence (visible=false suffit pas à unmount), le state local React DOIT être reset sur `visible` transition. Trois patterns valides : (a) `useEffect(reset, [visible])`, (b) conditional mount `{isOpen && <Modal>}`, (c) `key={openCounter}` forcing remount. GDPR Art. 7 : consent inheritance interdit entre opens.
3. **ISO wire format / Intl FE format doctrine** — backend emit dates en ISO 8601 UTC. Frontend formate via `Intl.DateTimeFormat(locale, { dateStyle, timeStyle })`. JAMAIS interpolation raw `{isoString}` dans UI text. Anti-pattern : `<Text>Resets on {resetAt}</Text>` → users voient `2026-06-01T00:00:00.000Z`.

---

## Historique (append-only)

| Date | Event |
|---|---|
| 2026-05-16 | Tracker initialisé après ultrareview run `r0wykavnv` — 4 findings triagés. F1+F2+F3 pipeline, F4 backlog. |
