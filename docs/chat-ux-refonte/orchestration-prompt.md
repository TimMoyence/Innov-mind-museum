# Chat UX Refonte — Orchestration Prompt

**Document à fournir en input à toute nouvelle session Claude Code travaillant sur ce chantier.** Self-contained, fresh-context safe.

---

## Mission

Refondre le module chat Musaium (mobile React Native + backend Node.js/Express) selon le scope défini dans [findings.md](findings.md) et tracké dans [tracking.md](tracking.md). 14 features, pipeline TDD enterprise-grade, 4 rôles d'agent, max 2-3 en flight.

## Contexte

- **Worktree** : `/Users/Tim/Desktop/all/dev/Pro/InnovMind-chat-ux/` (sibling de `InnovMind/`, isole de l'agent sur `main`)
- **Branch** : `worktree-feat+chat-ux-refonte` (isolé de `main` où un autre agent travaille sur C5 expo-image-manipulator)
- **Base** : `origin/main` @ `9dfd3178`
- **Cible** : V1 launch 2026-06-01 (memory `feedback_no_solo_dev_estimates` — pas de calendrier)
- **Doctrine produit** : voice-first, hybrid reactive/proactive, no fixed 3-choice buttons, no feature flags pre-launch, no unicode emoji, no multi-image upload user, UFR-013 honnêteté absolue.
- **Tech stack** : Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (BE pnpm), React Native 0.83 + Expo 55 + Expo Router (FE npm), Jest BE / Node test runner FE.

## Architecture des rôles

### 4 rôles distincts (jamais cumulés sur une feature)

| Rôle | Modèle conseillé | Fresh context ? | Outils | Responsabilité |
|---|---|---|---|---|
| **dispatcher** (toi, l'orchestrateur) | opus-4.7 | non — voit tout | Read, Bash, Edit, Agent | Lit `tracking.md`, pioche prochaine feature, spawn les 3 agents en cascade, met à jour `tracking.md`, applique cap concurrency |
| **discovery-agent** | opus-4.7 | non | Read, Grep, Bash (read-only) | Lit `findings.md` + code repo, produit `specs/<feature-id>.md` (spec EARS + design + tasks) |
| **red-test-agent** | opus-4.6 | non | Read, Grep, Write, Edit, Bash | Lit spec, écrit tests rouges (doit FAIL au baseline) |
| **green-code-agent** | opus-4.6 | **OUI fresh** | Read, Write, Edit, Bash | Lit UNIQUEMENT spec + tests, écrit code pour passer tests. Pas d'historique conversation. |
| **review-agent** | opus-4.7 | **OUI fresh** | Read, Grep, Bash (read-only) | Lit diff complet + spec, review fresh sans avoir vu le code écrit. Pas d'historique conversation. |

### Fresh-context obligatoire (V12 §8 anti-rubber-stamp)

`green-code-agent` et `review-agent` DOIVENT être spawnés via tool `Agent` (nouveau process), JAMAIS via SendMessage continuation. Critère :
- Leur contexte ne contient AUCUN message des autres rôles
- Inputs en argument du prompt : paths vers spec + tests + diff + run output JSON
- Pas de résumé "voici ce que le red-test-agent a fait" — ils lisent les fichiers from scratch

Si l'un détecte fuite de contexte (mention d'un autre rôle dans le system prompt) → verdict `BLOCK-CONTEXT-LEAK`, le dispatcher re-spawn.

### Concurrency cap

- **Max 3 features en flight** (status in {discovery, red, green, review, changes-requested})
- **Max 3 sub-agents read-only en parallèle** par fan-out (V12 §1 #1)
- **Tous les writes sérialisés** : 2 green-code-agents NE PEUVENT PAS écrire simultanément sur le même module (FE chat ou BE chat). Cross-module concurrent OK.
- **Corrective loop cap = 2** : 2 cycles review→changes-requested sur la même feature → ESCALADE user, pas de 3ème boucle automatique.

## Pipeline par feature (TDD)

```
[pending]
   ↓ dispatcher pioche
[discovery]  ← discovery-agent spawné
   ↓ produit specs/<feature-id>.md
[red]        ← red-test-agent spawné (même contexte que dispatcher, c'est OK : on lui passe la spec)
   ↓ écrit tests qui FAIL au baseline
   ↓ dispatcher vérifie : tests FAIL bien ?
[green]      ← green-code-agent spawné FRESH CONTEXT
   ↓ écrit code, run tests → PASS
   ↓ dispatcher run hooks lint+typecheck
[review]     ← review-agent spawné FRESH CONTEXT
   ↓ verdict APPROVED | CHANGES_REQUESTED | BLOCK
   ↓ si APPROVED → [done], tracking.md commit
   ↓ si CHANGES_REQUESTED → [changes-requested] → re-spawn green-code-agent fresh
   ↓ si BLOCK → escalate user
```

### Pas de skip

- Pas de feature qui saute `[red]` (sans tests rouges, pas de TDD).
- Pas de feature qui saute `[review]` (tier 1 et 2 incluses).
- Si red-test-agent dit "cette feature n'est pas testable" (e.g. pur UI déco sans logique) → ESCALADE dispatcher → décision user (skipper review humain OK ; skipper en silence interdit).

## Workflow détaillé (étape par étape)

### Étape 1 — Sélection feature (dispatcher)

```
1. Read tracking.md
2. Count inFlight = features avec status in {discovery, red, green, review, changes-requested}
3. If inFlight.count >= 3 → STOP, attendre une feature à done/blocked avant nouvelle pioche
4. Pioche la première feature avec status=pending dans l'ordre de pioche suggéré (tracking.md §"Ordre de pioche")
   - Si le suivant dépend d'une feature non-done → skip vers le suivant éligible
5. Update tracking.md : status `pending` → `discovery`, owner = "discovery-agent-<runid>"
```

### Étape 2 — Discovery (discovery-agent)

```
Spawn Agent:
  description: "Discovery <feature-id>"
  subagent_type: Explore (ou general-purpose si analyse trop large)
  prompt:
    "Tu es discovery-agent pour le chantier chat-ux-refonte.
     Mission : produire docs/chat-ux-refonte/specs/<feature-id>.md.
     Inputs :
       - docs/chat-ux-refonte/findings.md (lis pour le contexte global + scope row de la feature dans le tableau §5)
       - tracking.md row <feature-id> (1-ligne summary)
       - Code repo (read-only) pour comprendre l'existant à toucher
     Sections obligatoires de la spec :
       1. Spec (EARS format : `When X, the system SHALL Y`)
       2. Design (architecture decision, fichiers touchés, dépendances)
       3. Tasks (atomic T1.1..Tn.x, chacune testable individuellement)
       4. Acceptance criteria (machine-verifiable)
       5. Out-of-scope (explicit)
       6. NFR (a11y, perf, i18n FR/EN)
     Honesty UFR-013 : si une décision archi est ambiguë, dis-le dans une section `## Open questions` plutôt qu'inventer.
     Output final : path absolu vers la spec écrite + verdict (`READY` ou `BLOCKED-AMBIGUITY` + raison)."

Après retour :
- Si READY → update tracking.md : status `discovery` → `red`
- Si BLOCKED → escalate user
```

### Étape 3 — Red tests (red-test-agent)

```
Spawn Agent:
  description: "Red tests <feature-id>"
  subagent_type: general-purpose
  prompt:
    "Tu es red-test-agent pour le chantier chat-ux-refonte.
     Mission : écrire les tests qui FAIL au baseline (TDD red).
     Inputs :
       - docs/chat-ux-refonte/specs/<feature-id>.md (spec complète)
       - Tests existants du module pour le style (museum-backend/tests/unit/ ou museum-frontend/__tests__/)
       - tests/helpers/*.fixtures.ts (BE) ou __tests__/helpers/factories/*.ts (FE) — utiliser les factories existantes, JAMAIS inline (doctrine Musaium)
     Discipline :
       - 1 test = 1 acceptance criteria de la spec
       - Tests doivent FAIL avec l'output exact que produit le code actuel (pas un FAIL générique)
       - Run `pnpm test -- --testPathPattern=<path>` (BE) ou `npm test -- --grep <name>` (FE) → vérifie qu'ils failent vraiment au baseline
       - Si un test passe accidentellement → revoir l'assertion
     Honesty UFR-013 : rapporte verbatim l'output de FAIL (pas 'tests fail' générique).
     Output final : liste des paths de fichiers tests écrits + extrait stderr du test run prouvant qu'ils failent."

Après retour :
- Si tests FAIL bien → update tracking.md : status `red` → `green`
- Si tests PASS accidentellement → revoir avec red-test-agent ou escalate
```

### Étape 4 — Green code (green-code-agent, FRESH CONTEXT)

```
Spawn Agent (fresh, jamais via SendMessage):
  description: "Green code <feature-id>"
  subagent_type: general-purpose
  prompt:
    "Tu es green-code-agent fresh-context pour <feature-id>.
     Tu NE vois PAS l'historique des autres rôles. Tu lis depuis zéro :
       - Spec : docs/chat-ux-refonte/specs/<feature-id>.md
       - Tests rouges : <liste paths>
       - Code existant : <paths à modifier d'après la spec Design section>
     Mission : écrire le minimum de code pour que TOUS les tests rouges passent au vert. Pas de feature gold-plating.
     Discipline :
       - Pas d'`as any`, pas d'`eslint-disable` sans justification ≥20 chars
       - Path aliases : @modules/* @shared/* @data/* (BE) ou @/* (FE)
       - Pas de unicode emoji (Ionicons + PNG require uniquement)
       - Reduce-motion respecté si animation
       - i18n FR/EN si user-facing string
       - Doctrine no fixed 3-choice buttons (project_hybrid_product_philosophy)
       - Doctrine no feature flags pre-launch (feedback_no_feature_flags_prelaunch)
       - Bury dead code immédiatement, pas de DEPRECATED markers
     Hooks à run après chaque write :
       - BE : pnpm lint && pnpm test -- --testPathPattern=<scope>
       - FE : npm run lint && npm test -- --grep <name>
     Si test continue à FAIL après 5 cycles d'edit → STOP, escalate verbatim erreur.
     Output final : liste paths modifiés + dernière sortie test run (verbatim PASS)."

Après retour :
- Si tests PASS + hooks PASS → update tracking.md : status `green` → `review`
- Si tests FAIL après 5 cycles → escalate user (corrective loop cap, V12 §8)
```

### Étape 5 — Review (review-agent, FRESH CONTEXT)

```
Spawn Agent (fresh):
  description: "Review <feature-id>"
  subagent_type: general-purpose
  prompt:
    "Tu es review-agent fresh-context pour <feature-id>.
     Tu NE vois PAS l'historique. Tu lis :
       - Spec : docs/chat-ux-refonte/specs/<feature-id>.md
       - Diff : git diff <base-commit>..HEAD
       - Tests : <liste paths>
     Mission : review fresh sans biais.
     Checklist obligatoire :
       1. Code respecte 100% des acceptance criteria de la spec ?
       2. Tests couvrent vraiment ces criteria (pas tests bidon) ?
       3. Pas de dead code introduit (no DEPRECATED, no commented-out)
       4. Pas de violation doctrine (3 buttons, feature flag, unicode emoji, multi-image upload, mock DB tests)
       5. A11y : nouveaux composants interactifs ont accessibilityLabel/Role ?
       6. Perf : pas de re-render Provider trop large, pas de Animated.* sans useNativeDriver pour anim simples ?
       7. Hexagonal BE respecté : pas d'adapter qui import domain directement ?
       8. Path aliases utilisés ?
       9. Factories DRY pour tests (no inline entities) ?
       10. Si BE : Langfuse/Prometheus span ajoutés si nouveau code path latency-relevant ?
     Output JSON à docs/chat-ux-refonte/reviews/<feature-id>.json :
       {
         scoresOnFiveAxes: { correctness, doctrineCompliance, a11y, perfHygiene, testQuality } (0-100 each),
         weightedMean: number,
         verdict: APPROVED | CHANGES_REQUESTED | BLOCK,
         findings: { blocker: [], important: [], nit: [] },
         honesty_caveats: [] // UFR-013 — choses tu n'as pas pu vérifier
       }
     Verdict gating :
       weightedMean >= 85 → APPROVED
       70 <= weightedMean < 85 → CHANGES_REQUESTED
       < 70 → BLOCK"

Après retour :
- APPROVED → update tracking.md : status `review` → `done`, dispatcher commit (jamais agents)
- CHANGES_REQUESTED → update status `review` → `changes-requested`, increment correctiveLoops[feature], re-spawn green-code-agent FRESH avec findings comme input
- BLOCK → escalate user
- correctiveLoops >= 2 → escalate user (cap V12 §8)
```

### Étape 6 — Commit (dispatcher, JAMAIS agents)

```
Conditions :
  - tracking.md status = done
  - All hooks PASS verbatim
  - Diff scope aligné avec gitnexus_detect_changes() expected

Tech Lead (dispatcher) commit :
  git add <fichiers scope>
  git commit -m "feat(chat): <feature-id> <one-liner>
    
    Spec: docs/chat-ux-refonte/specs/<feature-id>.md
    Review: docs/chat-ux-refonte/reviews/<feature-id>.json (verdict APPROVED, score <N>)
    
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

Update tracking.md historique section.

Push NON automatique (memory feedback_auto_commit_end_feature : commit oui, push requires explicit ask).
```

### Étape 7 — Boucle

Retour étape 1.

## Anti-patterns interdits

- ❌ **Skip discovery** → "je sais déjà ce qu'il faut faire" — non, écris la spec, sinon le red-test-agent + review-agent travaillent sur un fantôme.
- ❌ **Green code en non-fresh-context** — viole V12 §8, rubber-stamp risk.
- ❌ **Review qui regarde l'historique de la conversation** — biais "j'ai vu ce code être écrit".
- ❌ **Tests vert au baseline** — c'est pas du TDD, c'est de la rédaction de tests post-hoc.
- ❌ **3ème corrective loop sur la même feature** — escalate, l'archi est pas bonne, change d'approche.
- ❌ **Mention d'unicode emoji dans new copy** — doctrine.
- ❌ **Feature flag `*_ENABLED`** — pre-launch, live ou revert.
- ❌ **Auto-commit feature non-done** — dispatcher commit seulement après gates PASS + APPROVED.
- ❌ **Mock DB sur integration tests** — doctrine (memory `feedback_quality_doctrine` analogue).

## Honesty UFR-013 — rappel

Tout agent qui ne peut pas vérifier un claim DOIT le dire dans son output. Exemples :
- `red-test-agent` : "Test FAIL message exact non-vérifié, j'assume baseline output X" → STOP, exécute le test.
- `green-code-agent` : "Hook lint passé, mais je n'ai pas couru gitnexus_detect_changes" → STOP, run it.
- `review-agent` : "Score perfHygiene 90 mais je n'ai pas profilé runtime" → mets dans `honesty_caveats`.

**Mentir, fabriquer, ou prétendre avoir vérifié sans le faire = violation UFR-013 = ESCALATE.**

## Fin de chantier

Une fois 14/14 features `done` :
1. Tag `chat-ux-refonte-v1` sur worktree branch
2. PR vers main : `gh pr create --base main --head worktree-feat+chat-ux-refonte`
3. Roadmap tick : cocher items dans `docs/ROADMAP_PRODUCT.md` (T1.6 auto-consolidation)
4. Memory write : nouveaux patterns appris (e.g. "bottom-sheet router consolidation = pattern X").

## Bootstrap : démarrer le chantier

Dans une nouvelle session Claude Code, fournir ce fichier comme input puis dire :

> "Lis `docs/chat-ux-refonte/orchestration-prompt.md`. Tu es dispatcher. Démarre le chantier. Pioche la première feature selon l'ordre suggéré dans tracking.md et lance le pipeline TDD."

Le dispatcher boucle jusqu'à `inFlight=0` + `pending=0` ou ESCALATE.
