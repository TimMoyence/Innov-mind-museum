# Next Level Master Plan — Phase 2 Closure + Phase 3 Launch

**Date** : 2026-04-17
**Stratégie** : A — Séquentiel ROI-first
**Horizon réaliste** : ~6-8 semaines
**Mode** : autonome, tech lead review entre chaque étape, 2x challenge par sprint

## Pourquoi ce plan

Après session 2026-04-17 (7 commits, ratchet 2655 → 2673), les plans P01-P06 sont DONE, P07 et P10 sont quasi-done (audit erroné), P08 a eu une passe DRY (4e88076e). Restent concrètement :

- **Phase 2** : P08 opportunités DRY résiduelles, P09 i18n/a11y à auditer vraiment, P10 vérif finale
- **Phase 3** : P11 guardrails V2 POC + P12 mobile perf V2 — aucun démarré

## Principes transversaux (non négociables)

1. **UFR-005 verify-before-validate** — chaque mini-sprint démarre par grep/read du code actuel, jamais par l'audit aveugle
2. **Commit atomique par mini-sprint** — un mini-sprint = un commit, rollback trivial, SPRINT_LOG + PROGRESS_TRACKER tenus ligne à ligne
3. **Quality ratchet lock** — tests BE ≥ 2673, FE ≥ 1120, 0 régression tsc, as-any baseline 0, eslint-disable pas en régression
4. **Tech lead review + 2x challenge par sprint** — après les mini-sprints d'un sprint, deux passes d'audit DDD/KISS/DRY/clean-archi
5. **Pause si fichier modifié hors de ma main** — `git status` avant chaque compile, stop si conflit
6. **No scope creep** — tout hors scope → plan numéroté séparé
7. **Report par mini-sprint** — `docs/plans/reports/NL-<sprint>-<slug>.md`

---

## Sprint NL-1 — Phase 2 Closure (3-4j)

**Objectif** : clore officiellement la Phase 2 avec tous les items P07-P10 à `[x]` dans PROGRESS_TRACKER.

### NL-1.1 — P08 Mobile Chat DRY finalization (0.5j)

**Scope** : auditer `useChatSession` et ses 3 sub-hooks pour traquer DRY résiduel similaire à P04 (buildOrchestratorInput), sans re-splitter la facade.

**Actions** :
1. `grep -rn "useSessionLoader\|useStreamingState\|useOfflineSync" museum-frontend/features/chat/`
2. Lire les 3 sub-hooks, chercher duplication dans message commit / error handling / state reset
3. Si DRY réel : extraire helper pur dans `chatSessionLogic.pure.ts`
4. Si pas de DRY réel : documenter dans le rapport "no-op intentionnel"
5. Tests verts + commit

**Deliverables** : `docs/plans/reports/NL-1.1-chat-dry-audit.md` + éventuel refactor

**Gates** : `npm test` OK, `npm run lint` OK, `git status` propre avant commit

### NL-1.2 — P09 Mobile i18n + A11y finalize (2-3j)

**Scope** : mesurer le taux réel de strings hard-codés vs `t()`, fermer les gaps, vérifier parity 8 locales, compléter les props a11y manquantes.

**Actions** :
1. **Inventaire** (0.5j)
   - `grep` pattern sur `.tsx` dans `app/`, `features/`, `shared/ui/` pour extraire strings hard-codés
   - Calcul coverage : (strings via `t()`) / (total strings)
   - Rapport `docs/plans/reports/NL-1.2-i18n-inventory.md` avec top 20 fichiers prioritaires
2. **Migration** (1-1.5j)
   - Par feature (chat → auth → museum → conversation → settings → onboarding → review → support → legal → shared/ui)
   - Un commit par feature ou par batch de 5 fichiers
   - Check `scripts/check-i18n-completeness.js` vert après chaque batch
3. **Parity 8 locales** (0.25j)
   - Script de vérification des clés manquantes dans en/fr/es/de/it/ja/zh/ar
   - Marquer `// TRANSLATION_REVIEW_NEEDED` sur les clés douteuses non-natives
4. **A11y audit** (0.25-0.5j)
   - Grep composants interactifs (`Pressable`, `TouchableOpacity`, `Button`, `Input`)
   - Checklist par composant : `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, `accessibilityState`, touch target ≥ 44pt
   - Rapport `docs/plans/reports/NL-1.2-a11y-audit.md`
   - Combler les gaps
5. Tests snapshot FR + EN sur écrans critiques

**Deliverables** :
- Coverage i18n ≥ 95% (rapport chiffré)
- Parity stricte 8 locales
- 0 composant interactif sans role+label
- 2 rapports `NL-1.2-*`

**Gates** : `npm run check:i18n` vert, `npm test` vert, `npm run lint` vert

### NL-1.3 — P10 Art Keywords R15 verify (0.5j)

**Scope** : vérifier que l'hexagonal art-keywords est complet et que la mémoire `project_smart_art_keywords_wip` est caduque.

**Actions** :
1. `gitnexus_context({name: "useArtKeywordsClassifier"})` pour voir la structure
2. Lire `features/art-keywords/application/` et `domain/` et `infrastructure/`
3. Vérifier coverage tests
4. Comparer avec la liste de 7+7 fichiers de la mémoire `project_smart_art_keywords_wip`
5. Si OK : rapport de clôture + suppression mémoire obsolète
6. Si manque : appliquer les mods restants

**Deliverables** : `docs/plans/reports/NL-1.3-art-keywords-closure.md`

**Gates** : `npm test`, `pnpm test` BE verts

### Tech Lead Review NL-1 + 2x Challenge

Après NL-1.3 :
1. **Review 1** — relire tous les diffs de NL-1.1 à NL-1.3 avec lens DDD/KISS/DRY/clean-archi
2. **Fix 1** — corriger ce qui est trouvé
3. **Review 2** — repasse complète, chercher ce qui a été raté
4. **Fix 2** — corriger
5. Commit récapitulatif + update PROGRESS_TRACKER Phase 2 à 100%

---

## Sprint NL-2 — P12 Mobile Perf V2 (10-15j)

**Objectif** : exploiter la New Architecture RN 0.83 + Expo 55 sur chemins critiques. Target : +15% FPS scroll, -10% cold start, -15% memory peak.

### NL-2.1 — Baseline perf (1-2j)

**Scope** : mesurer sur 2 devices physiques avant tout changement.

**Actions** :
1. Instrumenter RN DevTools Performance + React DevTools Profiler
2. Scenarios : cold start, chat 50/100/200 messages scroll, transitions screens, keyboard open
3. Mesures : FPS, cold start, TTI, memory peak, frame drop count
4. Rapport `docs/plans/reports/NL-2.1-baseline.md`

**Note autonome** : si devices physiques indisponibles en session autonome, produire un protocole de mesure exploitable + fixtures et signaler comme dépendance humaine.

### NL-2.2 — FlashList v2 migration (2-3j)

**Scope** : migrer `ChatMessageList` (+ listes similaires) de FlatList vers `@shopify/flash-list` v2.

**Actions** :
1. Vérifier lib déjà installée ou `npm i @shopify/flash-list`
2. Refactor `features/chat/ui/ChatMessageList.tsx` :
   - `FlatList` → `FlashList`
   - `getItemType={item => item.role}` (recyclage user vs assistant)
   - Remove `estimatedItemSize` (v2 sync layout)
3. Vérifier `MessageActionsBottomSheet`, autres listes chat
4. Tests snapshot + render + scroll intensif (fixture 200 messages)
5. Commit

**Gates** : `npm test`, `tsc --noEmit`, pas de régression visuelle

### NL-2.3 — Reanimated 3 audit + migration (2-3j)

**Scope** : identifier et migrer les animations JS-thread vers UI-thread worklets.

**Actions** :
1. `grep -rn "Animated\.\|useSharedValue\|useAnimatedStyle" museum-frontend/features/ museum-frontend/shared/`
2. Classer : OK (déjà Reanimated 3), à migrer (`Animated.Value` classique), à réécrire (`setInterval`/`requestAnimationFrame`)
3. Zones chaudes : `ChatInput` typing, `ChatMessageBubble` apparition stream, transitions navigation, onboarding carousel
4. Migration par animation avec test visuel + tests unitaires
5. Commit

**Gates** : worklets conformes (pas de `console.log`/async dans worklet), tests verts

### NL-2.4 — Expo Router v7 Stack.Screen + Native Tabs (2-3j)

**Scope** : adopter le header natif déclaratif et Native Tabs si applicable.

**Actions** :
1. Audit `app/**/*.tsx` pour Stack.Screen patterns legacy
2. Migrer vers `<Stack.Screen options={...} />` natif
3. Si tab bar custom JS → évaluer Native Tabs avec Material 3
4. Test transitions screens + tabs
5. Commit

### NL-2.5 — Memoization audit + after-measure (2-3j)

**Scope** : traquer re-renders inutiles + mesurer les deltas.

**Actions** :
1. React DevTools Profiler "why did this render" sur chat + dashboard + museum list
2. Ajouter `memo`/`useCallback`/`useMemo` là où prouvé nécessaire
3. Pas de memo-everywhere (anti-pattern)
4. Re-mesurer baseline scenarios
5. Rapport `docs/plans/reports/NL-2.5-after.md` avec deltas
6. EAS dev + preview builds
7. Commit

### Tech Lead Review NL-2 + 2x Challenge

Mêmes steps que NL-1 : 2 passes critiques + fix, puis PROGRESS_TRACKER mis à jour.

**Done When NL-2** :
- +15% FPS scroll `ChatMessageList` minimum
- -10% cold start minimum
- `docs/plans/reports/P12-*.md` tous présents
- EAS builds verts
- Aucune régression a11y/i18n

---

## Sprint NL-3 — P11 AI Guardrails V2 POC (15-20j)

**Objectif** : évaluer valeur ajoutée de NeMo Guardrails / LLM Guard / Prompt Armor vs pipeline actuel. Décision go/no-go documentée.

### NL-3.1 — Cartographie pipeline actuelle + metrics baseline (2-3j)

**Scope** : documenter la chaîne actuelle + mesurer false-positive, false-negative, latence P50/P95.

**Actions** :
1. Schéma pipeline actuelle dans `docs/plans/reports/NL-3.1-current-guardrails.md`
2. Dataset bénin + malveillant pour mesurer (50 prompts chacun)
3. Script `scripts/benchmark-guardrails-baseline.ts`
4. Rapport chiffré

### NL-3.2 — Framework comparison (2-3j)

**Scope** : comparer NeMo Guardrails, LLM Guard, Prompt Armor sur critères pratiques Musaium.

**Actions** :
1. Lire docs officielles + GitHub de chaque
2. Identifier les features activables individuellement
3. Node.js integration (direct ou sidecar Python ?)
4. Latence annoncée, coûts, licences
5. Rapport `docs/plans/reports/NL-3.2-frameworks-comparison.md` (tableau)

### NL-3.3 — POC adapter + dataset (3-4j)

**Scope** : port hexagonal + 1 adapter minimum (priorité self-hosted) + dataset benchmark.

**Actions** :
1. Créer `chat/domain/ports/advanced-guardrail.port.ts`
2. Implémenter 1 adapter (probablement LLM Guard — Node compatible via Python sidecar ou via port HTTP)
3. Dataset 220 prompts dans `tests/fixtures/guardrails-dataset.json` :
   - 100 bénins art-topic
   - 50 off-topic
   - 30 injections OWASP LLM Top 10
   - 20 PII
   - 20 frontaliers
4. Env flag `GUARDRAILS_V2_CANDIDATE` pour activation POC
5. Commit

### NL-3.4 — Benchmark exhaustif (3-4j)

**Scope** : mesurer les 4 configs (current, current+NeMo, current+LLM Guard, current+Prompt Armor si SaaS key) sur les 220 prompts.

**Actions** :
1. Script `scripts/benchmark-guardrails.ts`
2. Mesurer : latence P50/P95, FP rate, FN rate, injection detect, PII detect, $/1k msg
3. Rapport `docs/plans/reports/NL-3.4-benchmark.md` (tableau complet)

### NL-3.5 — Décision go/no-go + documentation (2-3j)

**Scope** : décision vs critères go, plan migration progressive si go.

**Critères go** :
- Latence P95 ajoutée ≤ 150ms
- False positive rate +2% max
- Injection detect rate ≥ +20% vs current
- Coût ≤ $0.005/message

**Actions** :
1. Rapport `docs/plans/reports/NL-3.5-decision.md`
2. Si go : plan A observe → B block high-confidence → C full
3. Si no-go : revisite T+6 mois + ce qu'il faudrait pour go
4. Update `CLAUDE.md` section AI Safety
5. Nouveau `docs/SECURITY_AI_PIPELINE.md` si go

### Tech Lead Review NL-3 + 2x Challenge

Mêmes steps.

---

## Verification globale & clôture

À la fin des 3 sprints :

1. **Tests complets** : `pnpm test` BE + `npm test` FE + `pnpm lint` + `npm run lint`
2. **Hooks** : `git commit` avec hook passthrough, 0 erreur
3. **PROGRESS_TRACKER** : Phase 2 et Phase 3 cochées
4. **SPRINT_LOG** : chaque commit documenté
5. **docs/plans/README.md** : statuts finaux
6. **docs/plans/reports/** : tous les rapports présents
7. **Ratchet final** : tests BE+FE, as-any, eslint-disable
8. **Commit final récap** + push (si user demande)

## Risques identifiés

- **NL-2.1 baseline** nécessite devices physiques → dépendance humaine
- **NL-3.4 benchmark** nécessite access LLM (API keys) → peut être partiel en autonome
- **NL-3 Python sidecar** (si NeMo choisi) → surcoût infra à valider
- **Coverage i18n 95%** peut excéder 1.5j si volume FR hard-codé réel > 200 strings → découper en 2 sessions

## Dépendances bloquantes (jamais contournées)

- NL-1 bloque NL-2 (perf needs solid mobile tests)
- NL-1 bloque NL-3 (chat clean ≠ POC guardrails)
- NL-2.1 bloque NL-2.2 → 2.5 (no after without before)
- NL-3.1 bloque NL-3.2 → 3.5 (no comparison without current metrics)

## Stop conditions

Je m'arrête (et commit partiel + report) si :
- Un fichier est modifié hors de ma main pendant un build (attente résolution)
- Régression ratchet détectée après fix 2 (escalade user)
- Dépendance humaine requise (device, API key critique)
- Hook pré-commit bloque pour raison non triviale
