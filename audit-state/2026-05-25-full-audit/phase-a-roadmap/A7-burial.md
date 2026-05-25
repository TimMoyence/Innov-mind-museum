# A7 — P0.D Honesty / dead-code burial (P0.D1–D5 + TD-AS-01)

> Agent fresh-context READ-ONLY (UFR-013 / UFR-024). Ref vérifiée : **`dev` @ HEAD `89852f2a1`**.
> Baseline du prior finding `D6-lot6-burial.md` = `9aff378b0` (avant le merge LOT 6 / PR #299).
> Aucun code/doc modifié. Chaque verdict cite preuve reproductible (git ls-files / git grep / git show).
> Tous les commits de burial cités sont **ancêtres de HEAD** (`git merge-base --is-ancestor … HEAD` → yes pour les 7) : `e7adb6a00` (Merge PR #299), `134abe293` (D1), `0d0b2fda5` (D4), `eda7a0b7d` (D3), `e49b75fe5` (D2), `15abcc94d` (TD-AS-01), `af2d31468` (D5).

---

### P0.D1 — SSE residuals burial — VERDICT: DONE
- Marqueur roadmap actuel : ⚠️ (`docs/ROADMAP_PRODUCT.md:131`) + ❌ dans exit-criteria (`:148`)
- État réel vérifié : les 3 résidus dormants ciblés sont **supprimés** au HEAD.
  - `git ls-files museum-frontend/features/chat/infrastructure/sseParser.ts museum-frontend/features/chat/infrastructure/chatApi/stream.ts museum-frontend/tests/sse-parser.test.ts` → **vide** (3 fichiers absents de l'index).
  - `git show 134abe293 --stat` : `stream.ts | 214 --------`, `sseParser.ts | 81 ---`, `tests/sse-parser.test.ts | 139 -----`, `_internals.ts | 13 -` (flag `isChatStreamingEnabled()` retiré), `chatApi.test.ts` réécrit (−587/+…), `.env.example | 3 -` + `.env.local.example | 5 -` (option `EXPO_PUBLIC_CHAT_STREAMING` retirée). Total commit : **+42 / −1093**.
  - `git grep "EXPO_PUBLIC_CHAT_STREAMING" -- ':!*.md'` → seules 4 occurrences subsistent, toutes dans `museum-frontend/__tests__/infrastructure/chatApi.test.ts:419,425-426,444,446`, et ce bloc **prouve le contrat always-sync** (commentaire `:419` "pin that always-sync contract" : set le flag à `'true'` et asserte que l'envoi reste sync). Ce n'est PAS un résidu dormant, c'est un test de non-régression légitime.
  - `sendMessageStreaming.ts` (185 LOC) reste présent et **LIVE** (stratégie d'envoi par défaut, `useChatSession.ts:237`) — conforme au correctif de claim D6 (jamais du dead-code).
- CHECKBOX-FLIP : **oui** → `⚠️` → `✅` (ligne `:131`) ; exit-criteria `:148` D1 → ✅. Raison : les ~434 LOC dormants identifiés en D6 sont enterrés ; le flag streaming est retiré ; `sendMessageSmart` collapse au path sync.
- Amélioration/debt : aucune. Le claim D6 "≈434 LOC" est honoré (commit supprime 214+81+139 = 434 LOC source/test + le flag).

---

### P0.D2 — Stryker incremental cache committed 18.5 MB — VERDICT: DONE
- Marqueur roadmap actuel : ❌ (`docs/ROADMAP_PRODUCT.md:132`) + ❌ exit-criteria (`:148`)
- État réel vérifié : fichier **untracked** au HEAD.
  - `git ls-files --error-unmatch museum-backend/reports/stryker-incremental.json` → `erreur : … ne correspond à aucun fichier connu de git` (rc=1) ⇒ retiré de l'index.
  - `git show e49b75fe5 --stat` : `museum-backend/reports/stryker-incremental.json | 397977 ---------------------` (1 file changed, 397977 deletions). `.gitignore:227` (`museum-backend/reports/`) couvre déjà → pas de bump nécessaire (conforme au correctif D6).
  - Note méthodo : `git ls-files <path>` retourne rc=0 avec sortie vide (commande réussie, fichier non listé). C'est `--error-unmatch` qui prouve le untrack (rc=1).
- CHECKBOX-FLIP : **oui** → `❌` → `✅` (ligne `:132`) ; exit-criteria `:148` D2 → ✅. Raison : `git rm --cached` appliqué, 18.5 MB / 397 977 lignes sortis de l'index.
- Amélioration/debt : aucune.

---

### P0.D3 — Llama-Prompt-Guard ~571 LOC dormant — VERDICT: DONE
- Marqueur roadmap actuel : ❌ (`docs/ROADMAP_PRODUCT.md:133`) + ❌ exit-criteria (`:148`)
- État réel vérifié : tous les résidus **supprimés**.
  - `git ls-files 'museum-backend/**llama-prompt-guard*'` → **vide** (adapter + test + docker-compose absents).
  - `git grep -ni "llama.prompt.guard\|LlamaPromptGuard" -- 'museum-backend/src/**'` → **0 hit** (plus aucune ref source, JSDoc port incluse).
  - `git show eda7a0b7d` (commit message) : "bury never-wired llama-prompt-guard adapter (D3, ADR-051)". Décision DELETE V1 lockée (W6.1, ADR-051) honorée.
- CHECKBOX-FLIP : **oui** → `❌` → `✅` (ligne `:133`) ; exit-criteria `:148` D3 → ✅. Raison : adapter (180) + test (338) + docker-compose (53) + stubs env supprimés ; zéro wiring cassé (adapter jamais instancié).
- Amélioration/debt : vérifier en passant que `src/config/env.ts` n'a plus les 3 lignes `LLAMA_PROMPT_GUARD_*` (le grep 0-hit ci-dessus le confirme indirectement — aucune ref `llama` dans src/).

---

### P0.D4 — 3 hard-skips `describe.skip` (238 LOC) — VERDICT: DONE
- Marqueur roadmap actuel : ⚠️ (`docs/ROADMAP_PRODUCT.md:134`) + ❌ exit-criteria (`:148`)
- État réel vérifié : les 3 suites **supprimées**.
  - `git ls-files museum-backend/tests/unit/chat/art-keyword-repo-atomic-upsert.test.ts museum-backend/tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts museum-backend/tests/unit/data/db/migrations/AddP1FKAndTokenIndexes.spec.ts` → **vide** (3 fichiers absents).
  - `git log --oneline -1 0d0b2fda5` : "delete 3 dead unconditional describe.skip suites (D4, 238 LOC)".
  - `streaming.e2e.test.ts` (BE, conditionnel) correctement écarté de D4 (faux positif D6) — non touché.
- CHECKBOX-FLIP : **oui** → `⚠️` → `✅` (ligne `:134`) ; exit-criteria `:148` D4 → ✅. Raison : les 238 LOC de hard-skips inconditionnels supprimés (option "delete" du choix delete-or-reenable).
- Amélioration/debt : DELETE choisi plutôt que re-enable → si la couverture des migrations `AddCriticalChatIndexesP0` / `AddP1FKAndTokenIndexes` redevient pertinente, elle est désormais à recréer (debt mineure, acceptable : c'étaient des stubs dead-on-arrival).

---

### P0.D5 — Doc UFR-013 fixes (ADR-036 v2 + AiDisclosureModal) — VERDICT: DONE
- Marqueur roadmap actuel : ⚠️ (`docs/ROADMAP_PRODUCT.md:135`) + ❌ exit-criteria (`:148`)
- État réel vérifié : les 2 résiduels OPEN du D6 sont **corrigés**.
  - **(a) ADR-036** : `git grep "llm:v1:" -- docs/adr/ADR-036-llm-cache-strategy.md` → 0 hit. `:15` et `:56` disent maintenant `llm:v2:{contextClass}:…`, avec note `:56` "The `v2` namespace (bumped from `v1` by `d54552beb`, 2026-05-19) … source of truth `llm-cache.service.ts:119`". Conforme au code.
  - **(b) AiDisclosureModal** : `git grep "AiDisclosureModal" -- docs/legal/` → **0 hit** (rc=1). `AI_DISCLOSURE.md` + `AI_DISCLOSURE_AUDIT.md` renommés en `AiDisclosureSheetContent`. Composant réel confirmé présent : `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx`.
  - **Refs `AiDisclosureModal` subsistantes = INTENTIONNELLES** (pas un stale-claim) : `docs/adr/ADR-055-…:21` (liste "before refactor" historique des modales pré-bottom-sheet-router — contextuellement correcte) et `docs/TECH_DEBT.md` (TD-57, qui dit explicitement `:519` "`AiDisclosureModal.tsx` **n'existe plus** — refactoré en `AiDisclosureSheetContent.tsx`"). Le commit `af2d31468` les exempte explicitement et à raison.
  - Rotation TECH_DEBT (déjà DONE-DEV en D6) inchangée.
- CHECKBOX-FLIP : **oui** → `⚠️` → `✅` (ligne `:135`) ; exit-criteria `:148` D5 → ✅. Raison : ADR-036 v1→v2 corrigé + AiDisclosureModal→AiDisclosureSheetContent dans tous les docs légaux ; résidus restants = références historiques voulues.
- Amélioration/debt : aucune. (TD-57 "Learn more pointe in-app + page marketing web absente" reste un item TECH_DEBT ouvert distinct, hors périmètre D5.)

---

### TD-AS-01 — AsyncStorage key namespacing — VERDICT: DONE
- Marqueur roadmap actuel : item TECH_DEBT (`docs/TECH_DEBT.md:1259`, marqué résolu par commit `15abcc94d`) ; pas de checkbox roadmap dédiée dans P0.D.
- État réel vérifié : codemod `musaium.<feature>.<key>` + migration reader **appliqués**.
  - `git show 15abcc94d --stat` : nouveau `museum-frontend/shared/infrastructure/migrateStorageKey.ts` (51 LOC, +test 99 LOC) ; 6 fichiers source re-préfixés ; 7 suites de test balayées ; `docs/TECH_DEBT.md` TD-AS-01 marqué résolu.
  - Live keys désormais namespacées (vérifié par grep) :
    - `ThemeContext.tsx:17` `THEME_KEY = 'musaium.theme.mode'` (legacy `app.themeMode` conservé en `LEGACY_THEME_KEY` pour migration, `:37` `migrateStorageKey(THEME_KEY, LEGACY_THEME_KEY)`).
    - `runtimeSettings.ts:19-20` `'musaium.runtime.defaultLocale'` / `'musaium.runtime.defaultMuseumMode'` (legacy `runtime.*` en `LEGACY_*` `:24-34`).
    - `useResumableSession.ts:20` `'musaium.settings.resumptionBannerDismissedUntil'` (legacy `settings.resumption_banner_dismissed_until` `:23`, migré `:111`).
    - `mapCameraCache.ts:4` `'musaium.museum.lastCameraView.v1'` (legacy `:6`).
    - `useDailyArt.ts:7-8` `'musaium.dailyArt.savedArtworks'` / `'musaium.dailyArt.dismissed'` (legacy `@musaium/*` `:11-12`, migrés `:16,40-41`).
    - `I18nContext.tsx:58-59` migre `runtime.defaultLocale` → `musaium.runtime.defaultLocale` (6e consommateur legacy locale).
  - Les strings raw historiques (`app.themeMode`, `runtime.*`, `@musaium/*`) ne subsistent QUE comme constantes `LEGACY_*_KEY` consommées par `migrateStorageKey()` (lecture one-shot no-overwrite) → pas de perte de prefs utilisateur au rename. C'est exactement le "codemod + migration reader" prescrit par TD-AS-01.
- CHECKBOX-FLIP : **oui** → marquer TD-AS-01 ✅/résolu si une ligne roadmap le référence (exit-criteria `:148` le liste ; flip → ✅). `docs/TECH_DEBT.md` déjà à jour (résolu) par le commit.
- Amélioration/debt : les readers de migration `migrateStorageKey` peuvent être retirés après une fenêtre de bake (≥1 release publiée) une fois que la base installée a migré — petite debt de cleanup futur, à tracker.

---

## Synthèse périmètre

| Item | Marqueur roadmap | Verdict HEAD | Flip recommandé |
|---|---|---|---|
| P0.D1 SSE | ⚠️ | **DONE** | ⚠️→✅ |
| P0.D2 stryker 18.5MB | ❌ | **DONE** | ❌→✅ |
| P0.D3 llama-prompt-guard | ❌ | **DONE** | ❌→✅ |
| P0.D4 3 describe.skip | ⚠️ | **DONE** | ⚠️→✅ |
| P0.D5 doc honesty | ⚠️ | **DONE** | ⚠️→✅ |
| TD-AS-01 namespacing | (TECH_DEBT résolu) | **DONE** | exit-criteria → ✅ |

Exit-criteria ligne `:148` ("P0.D1-D5 burial + honesty : **NON démarré** (LOT 6)") est **FALSE-CLAIM au HEAD** : entièrement fait via PR #299 (`e7adb6a00`) + commits D1-D5 + TD-AS-01. À réécrire ✅.
