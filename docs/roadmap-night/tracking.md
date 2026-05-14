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
| R5 | Voice dans smoke prod | C7.1 | 1 | `pending` | [specs/R5.md](specs/R5.md) | — | BE-only. Étendre `scripts/smoke-api.ts` avec un test TTS round-trip (chat envoie message → assistant répond → audio buffer reçu + valid MP3). Pas de dépendance externe. |
| R4 | Page B2B pitch | W4.3 | 2 | `pending` | [specs/R4.md](specs/R4.md) | — | museum-web. Nouvelle route `/[locale]/b2b/`, copy musée (offre, pricing fourchette, contact form Brevo). Cohérent avec landing existant. |
| R3 | CTA inscription bêta | W4.2 | 2 | `pending` | [specs/R3.md](specs/R3.md) | — | museum-web. Formulaire email sur landing, capture Brevo liste pré-launch (1ère vague 100 testers). Couplé à C6.3 funnel. |
| R2 | Export CSV admin | W3.4 | 2 | `pending` | [specs/R2.md](specs/R2.md) | — | BE + museum-web. Endpoints `/admin/export/{sessions,reviews,tickets}.csv` + bouton FE. Exigence légale RGPD + B2B reporting. |
| R1 | Soft-paywall stub complet | C6 (1-5) | 1 | `pending` | [specs/R1.md](specs/R1.md) | — | BE : `User.tier` enum + migration + monthly counter middleware + admin override. Mobile : modal upsell ISOLÉ (`features/paywall/`, natif RN Modal, NOT BottomSheetRouter). museum-web : admin tier toggle + funnel telemetry. **Le plus gros, attaqué en dernier.** |
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

## Historique (append-only)

| Date | Event |
|---|---|
| 2026-05-14 | Worktree créé, baseline `d203877f6`, 5 features `pending` + R6 `blocked` (dep chat-ux A5). Tracker initialisé. |
