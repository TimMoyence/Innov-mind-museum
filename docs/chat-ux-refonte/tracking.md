# Chat UX Refonte — Tracking

Source de vérité pour l'état du chantier. **Toute mise à jour passe par ce fichier** (append-only convention : on modifie le `Status`, on n'écrase pas l'historique des Notes).

**Worktree** : `.claude/worktrees/feat+chat-ux-refonte/`
**Branch** : `worktree-feat+chat-ux-refonte`
**Démarré** : 2026-05-14
**Cible launch V1** : 2026-06-01 (memory : `feedback_no_solo_dev_estimates` — pas de calendrier)

---

## Conventions

### Statuts (état machine, lifecycle linéaire)

| Statut | Sens | Owner attendu |
|---|---|---|
| `pending` | À démarrer | — |
| `discovery` | Spec mini Spec Kit (spec.md / design.md / tasks.md) en cours | discovery-agent |
| `red` | Tests rouges écrits, code pas encore | red-test-agent |
| `green` | Code en cours pour faire passer les tests | green-code-agent (fresh ctx) |
| `review` | Diff complet, en review fresh-context | review-agent (fresh ctx) |
| `changes-requested` | Review verdict < APPROVED — retour green | green-code-agent |
| `done` | Mergé sur la branche worktree, hooks PASS, gates PASS | — |
| `blocked` | Bloqué externe (décision user, dep tierce, archi) | dispatcher |

### Concurrency cap

**Max 2-3 features en flight simultanément** dans des stages différents (e.g. F-A2 en review, F-A5 en green, F-A6 en red). Le dispatcher REFUSE de démarrer une 4ème feature.

### Pour chaque feature

- Spec produite par `discovery-agent` à `docs/chat-ux-refonte/specs/<feature-id>.md` (3 sections : Spec / Design / Tasks).
- Tests rouges produits par `red-test-agent` — doivent FAIL au baseline avant que green-code-agent démarre.
- Green code par fresh-context agent : lit UNIQUEMENT spec + tests (pas l'historique de la conversation).
- Review par fresh-context agent : lit diff + spec.

### Gates obligatoires avant `done` (BE)

- `pnpm lint` PASS (scoped si possible)
- `pnpm test` PASS sur les fichiers touchés
- Pas de nouveau `eslint-disable` sans justification ≥20 chars + Approved-by
- Pas d'`as any` ajouté (ratchet baseline)
- `gitnexus_detect_changes()` aligné avec le scope attendu

### Gates obligatoires avant `done` (FE)

- `npm run lint` PASS (typecheck)
- `npm test` PASS (Node test runner, .test-dist/)
- Accessibilité : labels présents sur tout nouveau composant interactif
- Pas d'unicode emoji (Ionicons + PNG require uniquement)
- `useReducedMotion()` respecté si animation ajoutée

---

## Features

| ID | Nom | Tier | Status | Spec | Owner | Notes |
|---|---|---|---|---|---|---|
| A1 | Unified composer (mic+text+slide-up sheet) | 2 | `pending` | [specs/A1.md](specs/A1.md) | — | Remplace `MediaAttachmentPanel` toujours-on |
| A2 | Artwork hero card pinned (collapsible) | 1 | `pending` | [specs/A2.md](specs/A2.md) | — | Top du thread, expand→pinch-zoom |
| A3 | Bubbles différenciées (mat user / glass assistant) | 2 | `pending` | [specs/A3.md](specs/A3.md) | — | Tokens design system, pas nouvelles couleurs |
| A4 | Top bar collapsible au scroll | 2 | `pending` | [specs/A4.md](specs/A4.md) | — | Reanimated 3 ciblé ou Animated RN |
| A5 | Status typés (5 strings contextuels) | 1 | `pending` | [specs/A5.md](specs/A5.md) | — | BE expose phase via Langfuse, surface en SSE/response payload |
| A6 | Citation chips (source/confidence badges) | 1 | `pending` | [specs/A6.md](specs/A6.md) | — | Catalogue musée vs IA — UFR-013 surfacée UI |
| B1 | Carnet de visite post-visite | 2 | `pending` | [specs/B1.md](specs/B1.md) | — | Œuvres scannées + transcripts + photos + carte ; export PDF/URL |
| B2 | Conversation resumption banner | 2 | `pending` | [specs/B2.md](specs/B2.md) | — | "Reprendre devant *La Liseuse* ?" si <7j même musée |
| B3 | "Ask more" inline (1 follow-up contextuel) | 1 | `pending` | [specs/B3.md](specs/B3.md) | — | JAMAIS 3 boutons — référence un fact précis ou rien |
| B4 | QR cartel fallback | 2 | `pending` | [specs/B4.md](specs/B4.md) | — | expo-camera barcode reader, lookup number → openMessage |
| B5 | Sotto-voce mode toggle | 1 | `pending` | [specs/B5.md](specs/B5.md) | — | Top bar toggle, audio mute, transcript live ; auto-suggest si ambient >70dB |
| B6 | Free-form voice proactive géoloc | 3 | `pending` | [specs/B6.md](specs/B6.md) | — | LocationResolver in-museum déjà en place ; banner suggestion, pas push notif |
| C3 | Cache LLM élargi scans œuvres répétitifs | 3 | `pending` | [specs/C3.md](specs/C3.md) | — | Cache key `(artworkSigLIPHash + locale + museumId + prefsHash)`, TTL 24h |
| C4 | Modal soup cleanup → BottomSheetRouter | 1 | `pending` | [specs/C4.md](specs/C4.md) | — | `@gorhom/bottom-sheet` ou state machine maison |

---

## Ordre de pioche suggéré (dispatcher heuristic)

Priorité par valeur d'apprentissage en cas d'incident en cours :

1. **C4 d'abord** (modal cleanup, refactor isolé, dégage le chemin pour A1)
2. **A5 + A6 en parallèle** (status typés + citation chips — petits, indépendants, validation de la pipeline TDD)
3. **A2** (hero card, foundation pour B1 carnet)
4. **B3** (ask more inline, branchable post-A6)
5. **A1 + A3 + A4 en parallèle** (refonte composer + bubbles + top bar — cohérence visuelle, à shipper en un bloc)
6. **B5** (sotto-voce, mécanique distincte voice)
7. **C3** (cache LLM, BE-only, bake ≥7j post-merge avant TTL tuning per ADR-036 R11)
8. **B4** (QR cartel fallback, isolated)
9. **B2** (conversation resumption — dépend de session persistence existante)
10. **B6** (free-form voice proactive — dépend de location consent UX, à arbitrer si banner ou silent)
11. **B1 EN DERNIER** (carnet de visite — la plus grosse, dépend de plusieurs autres pour transcripts/photos persistence, gros design)

Le dispatcher peut dévier si une feature débloque la suite plus efficacement.

---

## Cap watchdog

Le dispatcher tient ces compteurs en mémoire (et les met dans STORY/log à chaque update) :

```
inFlight = features avec status in {discovery, red, green, review, changes-requested}
correctiveLoops[feature-id] = nombre de cycles review→changes-requested
```

Règles dures :
- `inFlight.count > 3` → REFUSE démarrer nouvelle feature
- `correctiveLoops[X] >= 2` → ESCALADE user (pas de 3ème boucle automatique, cf. team-skill v12 §8)
- Tests rouges qui passent au baseline (pas vraiment red) → BLOCK red-test-agent, demande de revoir

---

## Historique (append-only)

| Date | Event |
|---|---|
| 2026-05-14 | Worktree créé, baseline `9dfd3178`, 14 features listed pending, audit consolidated `findings.md` |
