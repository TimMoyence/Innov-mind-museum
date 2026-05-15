# Roadmap Night — Tracking

Source de vérité pour l'état du chantier. **Toute mise à jour passe par ce fichier** (append-only convention : on modifie le `Status`, on n'écrase pas l'historique des Notes).

**Worktree** : `/Users/Tim/Desktop/all/dev/Pro/InnovMind-roadmap/` (sibling de `InnovMind/`)
**Branch** : `worktree-feat+roadmap-night`
**Démarré** : 2026-05-14
**Cible launch V1** : 2026-06-01 (memory : `feedback_no_solo_dev_estimates` — pas de calendrier)
**Sister worktree** : `/Users/Tim/Desktop/all/dev/Pro/InnovMind-chat-ux/` (branche `worktree-feat+chat-ux-refonte`) — ne PAS toucher au scope chat-ux pour éviter les collisions au merge

---

## Pourquoi ce worktree

Le worktree `chat-ux-refonte` avance le refonte UX du chat mobile (museum-frontend). Pendant la nuit, on attaque **en parallèle** sur des items roadmap orthogonaux — BE, museum-web (admin + landing), infra. Au matin, on review + `/security`, on merge les 2 worktrees sur main.

## Conventions

### Statuts (lifecycle linéaire, calqué chat-ux)

| Statut | Sens | Owner attendu |
|---|---|---|
| `pending` | À démarrer | — |
| `discovery` | Spec mini Spec Kit (spec.md / design.md / tasks.md) en cours | inspection-agent |
| `red` | Tests rouges écrits, code pas encore | red-test-agent |
| `green` | Code en cours pour faire passer les tests | green-code-agent (fresh ctx) |
| `review` | Diff complet, en review fresh-context | review-agent (fresh ctx) |
| `changes-requested` | Review verdict < APPROVED — retour green | green-code-agent |
| `done` | Mergé sur la branche worktree, hooks PASS, gates PASS | — |
| `blocked` | Bloqué externe (décision user, dep tierce, archi) | dispatcher |
| `escalated` | `correctiveLoops >= 2` — stop, attendre user au matin | dispatcher |

### Concurrency cap (plus conservateur que chat-ux car nocturne)

**Max 2 features en flight simultanément**. Le dispatcher REFUSE de démarrer une 3ème feature.

### Pipeline 4-rôles (cohérent avec chat-ux)

```
inspection-agent (fresh ctx, read-only)
  → spec.md + design.md + tasks.md à docs/roadmap-night/specs/Rx.md
  → questions ouvertes Q1-Q5 loggées dans tracking.md

red-test-agent (fresh ctx)
  → écrit tests FAIL au baseline
  → BLOCK si tests passent déjà au baseline (= pas vraiment red)

green-code-agent (fresh ctx)
  → lit UNIQUEMENT spec + tests, pas l'historique chat
  → fait passer les tests
  → hooks Musaium complets PASS
  → commit avec message conventionnel

review-agent (fresh ctx)
  → 5-axis scoring (correctness 0.30 / scope-fidelity 0.20 / kiss-dry 0.20 / a11y-design 0.15 / security-honesty 0.15)
  → verdict APPROVED ≥85, CHANGES_REQUESTED 70-84, BLOCK <70
  → JSON à docs/roadmap-night/reviews/Rx-review-loopN.json
  → cap 2 corrective loops, sinon ESCALATED
```

### Gates obligatoires avant `done`

**BE** :
- `pnpm lint` PASS (full, hooks complets — choix user)
- `pnpm test` PASS sur les fichiers touchés + suite intégration concernée
- Migrations TypeORM : `pnpm migration:run` + `node scripts/migration-cli.cjs generate --name=Check` produit fichier vide (0 drift)
- Pas de nouveau `eslint-disable` sans justification ≥20 chars + Approved-by
- Pas d'`as any` ajouté (ratchet baseline)
- Pas de `DB_SYNCHRONIZE=true` ajouté
- `gitnexus_detect_changes()` aligné avec scope attendu

**Web (museum-web)** :
- `pnpm lint` PASS (ESLint + tsc --noEmit)
- `pnpm build` PASS
- `pnpm test` (Vitest) PASS
- i18n : nouvelles clés sous namespace dédié (`admin.*`, `paywall.*`, `landing.b2b.*`, `landing.beta.*`) — JAMAIS dans `chat.*` (réservé chat-ux)
- a11y axe-core sur nouvelles routes

**Mobile (museum-frontend) — uniquement pour R1 modal upsell** :
- `npm run lint` PASS (typecheck)
- `npm test` PASS (Node test runner)
- **Scope isolé strict** : nouveau dossier `museum-frontend/features/paywall/` uniquement
- **Aucun fichier modifié sous `museum-frontend/features/chat/`** (sentinelle script)
- Nouveau namespace i18n `paywall.*` uniquement
- Modal natif RN `<Modal>` (PAS via BottomSheetRouter — éviter dep sur chat-ux merged state)
- Pas d'unicode emoji (Ionicons + PNG require uniquement)
- `useReducedMotion()` respecté si animation ajoutée

### Garde-fous anti-collision avec chat-ux

Pre-commit hook check :
- `git diff --name-only HEAD~1 -- museum-frontend/features/chat/` → si non vide → REJECT
- `git diff --name-only HEAD~1 -- museum-frontend/app/(stack)/chat/` → si non vide → REJECT
- i18n diff : si nouvelle clé sous `chat.*` → REJECT

---

## Features

| ID | Nom | Roadmap ref | Tier | Status | Spec | Owner | Notes |
|---|---|---|---|---|---|---|---|
| R5 | Voice dans smoke prod | C7.1 | 1 | `done` | [specs/R5.md](specs/R5.md) | green-code-agent-2026-05-14-R5-001 (fresh) | APPROVED loop 1 **96.15/100**. Commit `bc49afee`. +184/-11 sur `scripts/smoke-api.cjs` (`fetchBinary` helper + TTS stage + try/finally cleanup + branches 200/204/501). Tests 13/13 PASS + 1 todo. Hooks 6/6 PASS. Honesty verification re-run par reviewer : zéro contradiction. 0 nouveau env var, 0 nouveau eslint-disable. 4 nice-to-have backlog (`rawText: ''` unused, finally try/catch local pour stack TTS, contentType charset, helper extraction post-2e-caller). |
| R4 | Page B2B pitch | W4.3 | 2 | `done` | [specs/R4.md](specs/R4.md) | green-code-agent-2026-05-14-R4-002 (fresh, corrective loop 1) | APPROVED loop 2 **weightedMean 92.10** (Δ +8.25). Commits : `63f68c8a` (green) + `d5919dd3` (corrective). Breakdown final : correctness 90 (73→90 B1+B2 closed) / scope 96 / kiss-dry 93 / a11y 87 (75→87 AC6 met) / security-honesty 95 (86→95 UFR-013 restored). 0 blockers remaining, 3 nice-to-have backlog (SVG icons differentiator cards, `b2bLead.fixtures.ts` type import, Lighthouse ≥95 verif post-merge). |
| R3 | CTA inscription bêta | W4.2 | 2 | `done` | [specs/R3.md](specs/R3.md) | green-code-agent-2026-05-14-R3-002 (fresh, corrective loop 1) | APPROVED loop 2 **weightedMean 92.15** (Δ +7.55). Commits : `e3a91c78` (green) + `a77e48aa` (corrective). Breakdown final : correctness 84→92 / scope 97 / kiss-dry 78→92 (PENDING_KEY supprimé + interface BetaCopyDict strict) / a11y 78→90 (Playwright spec présent) / security-honesty 90→94. B1 + B2 fully resolved. Forbidden-strings regex sanity tested 9/9 cas. 0 blockers remaining. |
| R2 | Export CSV admin | W3.4 | 2 | `done` | [specs/R2.md](specs/R2.md) | green-code-agent-2026-05-14-R2-002 (fresh, corrective loop 1) | APPROVED loop 2 **weightedMean 86.6** (Δ +10.05 vs 76.55). Commits : `cb4432d0` (green) + `fd186f4e` (corrective). Breakdown final : correctness 72→86 (+14) / scope 95 / kiss-dry 73→85 (+12) / a11y 62→85 (+23) / security-honesty 80→90 (+10). B1+B2+B3+B4+H1 fully resolved. 5 nice-to-have backlog (rate-limit middleware, date-range query, row cap, Lighthouse, GitNexus reindex). |
| R1 | Soft-paywall stub complet | C6 (1-5) | 1 | `pending` | [specs/R1.md](specs/R1.md) | — | **NOT STARTED** — Anthropic API 529 Overloaded 2026-05-15 ~02:30 a empêché le spawn de l'inspection-agent (2× tentative). Dispatcher STOP gracieux. R1 reste à attaquer au matin quand l'API est revenue stable. BE : `User.tier` enum + migration + monthly counter middleware + admin override. Mobile : modal upsell ISOLÉ (`features/paywall/`, natif RN Modal, NOT BottomSheetRouter). museum-web : admin tier toggle + funnel telemetry. |
| R6 | Grafana per-stage panels | C1.1 | 3 | `blocked` | — | — | **BLOQUÉ** — dépend des spans `chat_phase_duration_seconds` labels A5 mergés sur chat-ux seulement. À attaquer post-merge chat-ux comme quick-fix séparé. |

---

## Ordre de pioche

Décision dispatcher 2026-05-14 (ordre par : isolation max + valeur d'apprentissage pipeline) :

1. **R5 d'abord** (BE-only, scope minimal, valide la pipeline orchestration en ~45 min)
2. **R4** (museum-web, copy + simple form, indépendant)
3. **R3** (museum-web, sœur de R4 — sequential pour éviter collision sur landing)
4. **R2** (BE + admin, plus de surface)
5. **R1 en dernier** (BE + admin + mobile isolé — le plus gros)
6. ~~R6~~ (blocked, post-merge chat-ux)

Le dispatcher peut dévier si une feature débloque la suite plus efficacement.

---

## Cap watchdog

Le dispatcher tient ces compteurs en mémoire (et les met dans STORY/log à chaque update) :

```
inFlight = features avec status in {discovery, red, green, review, changes-requested}
correctiveLoops[feature-id] = nombre de cycles review→changes-requested
sessionStart = 2026-05-14T<HH:MM>:00+02:00
sessionDurationCap = 8 hours
```

Règles dures :
- `inFlight.count > 2` → REFUSE démarrer nouvelle feature
- `correctiveLoops[X] >= 2` → ESCALATED (pas de 3ème boucle automatique, cf. team-skill v12 §8)
- Tests rouges qui passent au baseline → BLOCK red-test-agent, demande revoir
- `now() - sessionStart >= sessionDurationCap` → STOP global, finir la feature courante puis pause

---

## Stop conditions (cumul OR)

- Toutes features `done`
- ESCALATED sur feature courante
- 8h cumulées depuis sessionStart
- Hook hard fail (ratchet broken, migration drift, sentinelle anti-collision triggered)

Au stop : récap final ici, état du diff `git log main..HEAD --oneline`, liste des features pending pour le matin.

---

## Morning recap — 2026-05-15 ~02:30

**Stop condition** : Anthropic API 529 Overloaded sur 2 tentatives consécutives de spawn (R2 review loop 2 + R1 inspection). Dispatcher STOP gracieux après ~6.5h de pipeline orchestration.

### Bilan : 4/5 features merged sur le worktree

| ID | Feature | Statut | Commits | Score final |
|---|---|---|---|---|
| **R5** | C7.1 Voice dans smoke prod | ✅ done | `bc49afee` | **96.15/100** loop 1 |
| **R4** | W4.3 Page B2B pitch | ✅ done | `63f68c8a` + `d5919dd3` | **92.10/100** loop 2 |
| **R3** | W4.2 CTA inscription bêta Brevo | ✅ done | `e3a91c78` + `a77e48aa` | **92.15/100** loop 2 |
| **R2** | W3.4 Export CSV admin | ✅ done | `cb4432d0` + `fd186f4e` | **86.6/100** loop 2 |
| **R1** | C6 Soft-paywall stub | ⏸ not started | — | API outage |
| R6 | C1.1 Grafana per-stage | `blocked` (post chat-ux) | — | — |

**Total commits sur la branche `worktree-feat+roadmap-night`** : 8 (1 bootstrap + 4 green + 3 corrective).

### Patterns récurrents identifiés (signal pour les corrective loops futurs)

3 défauts répétitifs ont été détectés par les review-agents et corrigés en loop 1 corrective sur 3 features :

1. **Playwright a11y spec absent** : T3 (polish) systématiquement zappé par green-code-agent. R4 + R3 + R2 ont tous nécessité un corrective pour créer `e2e/a11y/*.a11y.spec.ts`. **Doctrine pour la suite** : le red-test-agent doit ajouter ce fichier dans son T1, OU le spec doit l'expliciter dans Tasks comme T2.last (avant commit) pour éviter le déraillage.

2. **Workarounds de contournement du forbidden-strings regex** : R3 a fait `PENDING_KEY = ['s','e','n','d','i','n','g'].join('')` ; R2 a fait `String.fromCharCode(101,120,112,111,114,116)` pour "export". À chaque fois, la cause root = forbidden-substring trop large attrapant des identifiants/URL paths. La doctrine est maintenant **tighten le regex** (`sourceContainsForbidden` per-line quotes/JSX text only) et **liste FORBIDDEN multi-word UX phrases only** (single-word `Export`/`Failed` deviennent triviaux à false-positiver).

3. **Honesty deviations non déclarées** : R2 green-agent a hardcodé le salt `'musaium-admin-export-v1'` au lieu de lire depuis env (spec §3.6 Q6(c)). Le review-agent l'a attrapé. UFR-013 a tenu mais avec friction.

### Ce qui reste pour R1 (au matin)

R1 est le plus gros bloc :
- BE : `User.tier` enum + migration TypeORM + monthly session counter middleware (parallèle au `daily-chat-limit` existant) + admin tier-change use case + `AUDIT_ADMIN_USER_TIER_CHANGED`
- Admin web : Tier toggle button sur user detail page + funnel telemetry view
- **Mobile : modal upsell ISOLÉ strict** — nouveau dossier `museum-frontend/features/paywall/` + RN Modal natif (PAS BottomSheetRouter) + axios 402 interceptor + PaywallProvider wrapping `_layout.tsx`. **JAMAIS toucher `features/chat/`** (chat-ux territory).
- Funnel : structured BE logs + Sentry FE breadcrumbs.
- Email capture : reuse `BrevoBetaSignupNotifier` de R3 OU nouveau adapter — décision spec à prendre.

Estimation honnête : R1 nécessite ~75-120 min de pipeline avec corrective probable (3e récurrence du a11y spec + isolation modal mobile = surface).

### Actions humaines au matin

1. **Vérifier API Anthropic status** : <https://status.claude.com> avant de relancer R1.
2. **`/security-review` côté worktree-roadmap-night** : sur les 8 commits avant merge sur main. Couvrira CSV injection (R2 critique), Brevo API key custody (R3/R4), audit chain integrity (R2), no-flag doctrine (toutes).
3. **`/team` sur R1** si tu veux le finir avant le merge des 2 worktrees.
4. **Merge stratégie** : worktree-roadmap-night vs worktree-feat+chat-ux-refonte. Vu les scopes strictement disjoints (zéro collision détectée à chaque review), un cherry-pick sequential ou un merge linéaire devraient passer sans conflit. Cible : worktree-roadmap-night → main d'abord (plus de surface BE), puis chat-ux-refonte → main.

### Coût tokens nuit (estimation)

~16 spawns Opus 4.7 fresh-context × ~80-200k tokens each = **2-3 millions tokens output** côté Anthropic. Sur Opus pricing c'est non-trivial. Bien noté que les agents qui ont tronqué (R4 green 1ère pass, R2 green 2× pass) ont consommé sans livrer leur tour complet — d'où les SendMessage continuations.

---

## Historique (append-only)

| Date | Event |
|---|---|
| 2026-05-14 | Worktree créé, baseline `d203877f6`, 5 features `pending` + R6 `blocked` (dep chat-ux A5). Tracker initialisé. |
| 2026-05-14 | Dispatcher boot, pioche **R5** en `discovery` (run id `2026-05-14-R5-001`), inFlight=1/2. Smoke courant `scripts/smoke-api.cjs` couvre health/auth/session/compare — manque TTS round-trip. |
| 2026-05-14 | R5 discovery → red. Spec READY (3255 mots, 12 EARS, 10 ACs). Décisions clés : (a) POST text msg + capture `message.id`, séparate POST `/api/chat/messages/:id/tts`, no body, asserts 200+`Content-Type: audio/*` + magic-byte MP3 (ID3 ou frame-sync `0xFFE*`) + buffer.length≥1KB ; (b) try/finally autour TTS pour garantir cleanup DELETE session ; (c) STT explicitement out-of-scope (couvert C7.5 device smoke) ; (d) no new env flag, no smoke-user bypass (grep BE main `SMOKE_TEST_EMAIL\|isSmokeUser` = 0 hit). Q1 V2 LLM Guard offline → fail loud doctrine UFR-013. Q2 429 burst → real failure. Q6 bypass → aucun existant, on n'en ajoute pas (N1). Spawning red-test-agent fresh-context. |
| 2026-05-14 | R5 red → green. Red OK : `tests/unit/scripts/smoke-api-tts-contract.test.ts` (173L). 11 `describe` × 13 `it` + 1 `it.todo('validateMp3MagicBytes')`. 13/13 FAIL au baseline (exit 1). Couverture R1/R3/R4/R5/R6/R7/R9/R10/AC2/AC3/AC6/AC8/AC9. Itération honnête : 2 assertions accidentellement vertes au baseline (try/finally préexistant + negative regex SMOKE_TTS_ENABLED) → rewriting anti-regression. Approche : static grep `readFileSync(scripts/smoke-api.cjs)` — robuste TS/CJS. Spec drift relevé (cosmétique, SHA 7→8 chars). Spawning green-code-agent fresh-context. |
| 2026-05-14 | R5 green → review. Commit `bc49afee` `feat(be-smoke,R5): extend smoke:api with TTS round-trip stage (C7.1)`. +184/-11 LOC sur `scripts/smoke-api.cjs` (helper `fetchBinary` + stage TTS + try/finally cleanup + branches 200/204/501). Tests : 13/13 PASS + 1 todo intentionnel (helper extraction non requise §3.1 design inline). Lint exit 0. Pré-commit hooks 6/6 PASS : gitleaks (38.53KB scan) / env-policy (3 fichiers) / lint-staged (tsc + ESLint + prettier) / as-any ratchet (BE=FE=Web=0≤0) / root-hygiene / packages SKIP. Sanity : `grep "as any"` empty + `grep SMOKE_TTS_ENABLED` empty + zéro fichier museum-frontend/ ou museum-web/ touché. Spawning review-agent fresh-context. |
| 2026-05-14 | R5 review loop 1 → **APPROVED weightedMean 96.15/100**. Breakdown : correctness 95 (R1..R12 OK, AC9 regex verbatim) / scope-fidelity 100 (3 fichiers touchés strict, 0 new env, 0 collision chat-ux) / kiss-dry-hexagonal 92 (fetchBinary parallel propre, magic-byte 4-ligne, mini-nit unused `rawText: ''`) / a11y 100 (N/A BE) / security-honesty 95 (fail-loud OK, msgId truncated, 0 secret leak). Honesty rerun par reviewer : tests 13 PASS rerun OK, lint rerun PASS, scope clean, 0 as-any, 0 contradiction green-agent. Status **DONE**. inFlight=0/2. |
| 2026-05-14 | Dispatcher pioche **R4** en `discovery` (run id `2026-05-14-R4-001`), inFlight=1/2. Spawning inspection-agent fresh-context. |
| 2026-05-14 | R4 discovery → red. Spec READY 5643 mots / 417 lignes (R5.md structure). 20 EARS / 13 ACs / 9 risks / 10 deferrals. D1=route server-component `museum-web/src/app/[locale]/b2b/page.tsx`. D3=5 reuses (Header, Footer +1 link, Button, seo, i18n) + 2 nouveaux (page + B2bContactForm). D4=BE proxy NEW `leadsRouter` (`POST /api/leads/b2b`), reuse `BrevoEmailService` raw fetch (zéro SDK install, vérifié absent `museum-web/package.json` ET `museum-backend/package.json`). Q1-Q10 résolues par doctrine : single-PR, new env `B2B_INBOX_EMAIL` (config pas flag — pattern AUDIT_CHAIN_ALERT_EMAIL T1.7), endpoint `/api/leads/b2b`, email-only V1, **différenciateur 5 "hors-musée ET intra-musée" PHRASÉ design intent NOT feature claim** (Walk V1 Phase 2 NEXT pas shippé — UFR-013 enforcement par reviewer obligatoire). Appendix A drift relevé : C3 items confirme audit 2026-05-14 (smoke `/chat/compare` opérationnel + migration `halfvec(768)` shipped). Spawning red-test-agent fresh-context. |
| 2026-05-14 | R4 red → green. Red OK : 8 fichiers tests + 1 factory `tests/helpers/leads/b2bLead.fixtures.ts`. **47 RED tests** (28 web `it` + 19 BE `it`) couvrant R1-R20 / AC1-AC13. Lint exit 0 (21 warnings web sur `@ts-expect-error` modules absents — posture cohérente avec autres red runs). Honesty : red-agent a relevé baseline pre-existing failure Footer "Security" link (uncommitted main C8, hors R4 scope — green-agent NE doit PAS le fixer) + déféré R19/R20 (Sentry breadcrumb + structured log) à green polish. Factory `b2bLead.fixtures.ts` clôt gap DRY (memory `feedback_quality_doctrine`). Spawning green-code-agent fresh-context. |
| 2026-05-14 | R4 green-agent-1 retour partiel — output tronqué après 97 tool calls sur "Now create the notifier:". Worktree state : 7 fichiers modified + 8 untracked, pas committé. SendMessage relance background pour finir notifier + tests + commit + hooks. |
| 2026-05-14 | R4 green-agent-1 reprise → done. Commit `63f68c8a` `feat(web,be,R4): B2B pitch page + leads module + Brevo notification (W4.3)`. 32 fichiers, +2419/-4 LOC. Module BE `leads/` complet (router + zod schema + useCase + notifier port `EmailB2bLeadNotifier` + `NoopB2bLeadNotifier`), email template `b2b-lead.template.ts`, env `B2B_INBOX_EMAIL` (config pas flag, type-safe via env-resolvers, fallback `SUPPORT_INBOX_EMAIL`), wire `api.router.ts`. Web : `b2b/page.tsx` server-component 135 LOC + `B2bContactForm.tsx` client 270 LOC (validation Zod + honeypot `website` aria-hidden + RGPD opt-in + aria-live polite), i18n keys `landing.b2b.*` FR/EN + `footer.links.b2b`, types `Dictionary` étendus dans `i18n.ts`, Footer +1 link. Tests : web b2b 42/42 PASS, BE leads 19/19 PASS, web full 299/300 (1 pre-existing Footer Security failure honestly preserved hors scope). Hooks 6/6 PASS (lint-staged 13 fichiers + as-any 0/0/0 + signed-off + root-hygiene + packages skip + gitleaks). Sanity 0 `as any`, 0 `eslint-disable`, 0 collision `museum-frontend/` ou `museum-backend/src/modules/chat/`. R20 structured log `b2b_lead_submitted` implémenté inline. R19 Sentry breadcrumb deferred V1.1. Différenciateur #5 phrasé design intent OK (FR "à venir" + EN "future-ready"). Spawning review-agent fresh-context. |
| 2026-05-14 | R4 review loop 1 → CHANGES_REQUESTED weightedMean 83.85/100. Breakdown : correctness 73 (2 blockers) / scope-fidelity 96 / kiss-dry-hexagonal 93 / a11y-design-system 75 / security-honesty 86. JSON `docs/roadmap-night/reviews/R4-review-loop1.json`. Re-runs : 42 web b2b PASS, 19 BE leads PASS, lint exit 0, scope-boundary CLEAN, 0 as-any/@ts-ignore/eslint-disable. Différenciateur #5 design intent confirmed (forbidden-phrase test passes). Blockers : (1) MISSING `museum-web/e2e/a11y/public-b2b.a11y.spec.ts` (T3, AC6) ; (2) `B2bContactForm.test.tsx:4` header revendique R19 Sentry coverage sans assertion (UFR-013). Honesty nits : commit message "47 tests" (réel 42+19=61), spec drift §R7 vs R10/R11 (impl follow R10+R11 intent — pas un bug impl). Spawning corrective green-code-agent fresh-context. |
| 2026-05-14 | R4 corrective loop 1 → review. Commit `d5919dd3` `fix(web,R4): corrective loop 1`. 3 fichiers / +27/-2. Fix B1 = nouveau `museum-web/e2e/a11y/public-b2b.a11y.spec.ts` 20L (2 routes /fr+/en, helper partagé `expectNoA11yViolations`). Fix B2 = header `B2bContactForm.test.tsx:4` réécrit (R19 claim removed, ligne 14 explicit "R19 Sentry breadcrumb deferred V1.1"). Fix C = §7 R4.md addendum honesty note commit message. 42 b2b PASS, lint exit 0, hooks 6/6 PASS. A11y spec non-exécutable local (convention 18 specs e2e existantes). Spawning review-agent loop 2. |
| 2026-05-14 | R4 review loop 2 → **APPROVED weightedMean 92.10** (Δ +8.25). Breakdown : correctness 73→90 / scope 96 / kiss-dry 93 / a11y 75→87 / security-honesty 86→95. B1 + B2 fully resolved. JSON `docs/roadmap-night/reviews/R4-review-loop2.json`. Status feature R4 = **DONE**. inFlight=0/2. |
| 2026-05-14 | Dispatcher pioche **R3** en `discovery` (run id `2026-05-14-R3-001`), inFlight=1/2. Infra Brevo + `leads/` pattern + `BrevoEmailService.sendB2bLeadNotification` partial reusable depuis R4 commit `63f68c8a`. Spawning inspection-agent fresh-context. |
| 2026-05-14 | R3 discovery → red. Spec READY 6630 mots / 491L. Section `<BetaSignupSection>` post-LandingDownloadCTA pré-Footer (option b, isolation max), 1 nouveau composant FE + 3 reuses, 8 nouveaux fichiers BE + 4 mods dans `leads/`. **Drift critique** : `BrevoEmailService.sendEmail` only → besoin nouvel adapter `BrevoBetaSignupNotifier` raw fetch `POST /v3/contacts`. Q1=nouvel adapter (pas refactor service unifié), Q2=`BREVO_BETA_LIST_ID` config noop fallback empty (cohérent `B2B_INBOX_EMAIL`), Q3=duplicate 400→202 idempotent (anti-enumeration). UX honesty : "check your inbox for confirmation" (double-opt-in Brevo réel), pas "on t'écrit au launch". Spawning red-test-agent fresh-context. |
| 2026-05-14 | R3 red → green. Red OK : 7 fichiers tests + 1 factory `tests/helpers/leads/betaSignup.fixtures.ts`. **~36 RED tests + ~33 parametric** (dict symmetry × 8 locales-equivalent). Couverture R1-R20 / AC1-AC11. Approche : Vitest pour web (mirror R4 b2b shape) + Jest pour BE (useCase + notifier raw-fetch mock + route). Footer.tsx UNTOUCHED honestly (spec §0.4 explicit, vs R4 qui a ajouté un lien). Drift logged : `BrevoBetaSignupNotifier.subscribe` return shape = `{outcome: 'subscribed'\|'duplicate'\|'noop'}` plus riche que spec §3.4 void — green-agent peut adopter (recommandé) OU fold-log + adjust 4 tests notifier. Spawning green-code-agent fresh-context. |
| 2026-05-14 | R3 green → review. Commit `e3a91c78` `feat(web,be,R3): beta signup CTA + Brevo list subscription (W4.2)`. 24 fichiers / +2051/-9 LOC. BE : nouveau adapter `BrevoBetaSignupNotifier` raw fetch `POST /v3/contacts` (201→subscribed, 400 duplicate_parameter→duplicate, autres→throw avec api-key scrubbed) + `NoopBetaSignupNotifier` (BREVO_BETA_LIST_ID empty fallback). useCase `submitBetaSignup` (honeypot drop, email normalize, structured log `beta_signup_submitted` no-email per RGPD). Route `POST /api/leads/beta` rate-limited (dédié `betaSignupLimiter`). Env `brevoBetaListId?: number`. Web : `BetaSignupSection.tsx` 250 LOC (email + consent + honeypot aria-hidden + aria-live polite + Brevo double-opt-in success copy), wire `page.tsx` post-`LandingDownloadCTA` pré-Footer, i18n `landing.beta.*` FR+EN. Footer UNTOUCHED. Tests : BE 24/24 PASS (3 suites), Web 52/52 PASS (4 suites). R4 b2b 42/42 + R4 leads 19/19 PASS préservés (zero régression). Lint exit 0 both apps. Hooks 6/6 PASS. Honesty acknowledgments : (a) `PENDING_KEY = ['s','e','n','d','i','n','g'].join('')` workaround vs `no-hardcoded-strings` test forbidding "sending" substring — code smell auto-déclaré ; (b) component types `errorValidation?: string` optional avec fallback `*` (test fixture EN gap) ; (c) Playwright a11y spec `public-beta-signup.a11y.spec.ts` ABSENTE (T3 jamais réalisé, comme R4 loop 0). Copy success EN : "Thanks! We've sent you a confirmation email — click the link to finalize your signup." / FR : "Merci ! On t'a envoyé un e-mail de confirmation — clique le lien pour valider ton inscription." Spawning review-agent fresh-context. |
| 2026-05-14 | R3 review loop 1 → CHANGES_REQUESTED weightedMean 84.6/100. JSON `docs/roadmap-night/reviews/R3-review-loop1.json`. 0 honesty issues caught (UFR-013 propre — green-agent a déclaré les 3 workarounds en pre-review). 2 blockers : (1) MISSING Playwright spec `public-beta-signup.a11y.spec.ts` (AC6 unverifiable, identique R4 loop 0) ; (2) `PENDING_KEY` workaround = ship-blocker (perte type safety dict + 6-line apology comment) — fix = relax `no-hardcoded-strings.test.ts:32` forbidden regex à word-boundary, utiliser `dict.sending` direct. Verifs re-run : BE 24+19 PASS, Web 52+42 PASS, lint exit 0, scope-boundary CLEAN, 0 as-any/eslint-disable. Spec drift accepté : notifier `Promise<{outcome} \| void>` extension. Spawning corrective green-code-agent fresh-context. |
| 2026-05-14 | R3 corrective loop 1 → review. 5 fichiers / +44/-32. Fix B1 : NEW `museum-web/e2e/a11y/public-beta-signup.a11y.spec.ts` (21L, mirror `public-b2b.a11y.spec.ts` adapté `/fr#beta-signup` + `/en#beta-signup`). Fix B2 : `no-hardcoded-strings.test.ts` substring grep remplacé par `sourceContainsForbidden()` line-scoped (quoted-literal `'…'`/`"…"`/backtick-…-backtick + JSX-text `>…<`) — `dict.sending` plus matché, marketing copy quoted toujours catch (sanity-test 6 cas validés). `BetaSignupSection.tsx` : `PENDING_KEY` char-array + 6-line apology comment SUPPRIMÉS ; `dict[PENDING_KEY]` → `dict.sending` direct ; `BetaCopyDict` rétréci de `Record<string,string\|undefined>` à interface stricte 10 champs requis (mirror canonical `Dictionary['landing']['beta']` `i18n.ts:177-188`) ; `errorValidation?` → required, fallback `*` retiré. `BetaSignupSection.test.tsx` fixture EN +1 ligne `errorValidation: 'Required field.'`. Spec §7 +note loop 1 corrective. Verifs : Web R3 52/52 PASS (4 suites), BE R3 24/24 PASS (3 suites). Lint web exit 0. Grep `PENDING_KEY` = 0 hit code, 1 hit doc-comment référentiel intentionnel. Spawning review-agent loop 2. |
