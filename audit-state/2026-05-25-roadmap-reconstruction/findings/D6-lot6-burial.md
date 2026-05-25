# DOMAINE 6 — LOT 6 Burial dead-code / honnêteté — Verification findings

> Agent fresh-context read-only (UFR-013 / UFR-024). Ref vérifiée : **`dev`** (HEAD `9aff378b0`).
> Aucun code/doc modifié. Chaque verdict cite path:line lu (Read/Grep/git ls-files/wc -l), pas supposé.

---

- **P0.D1** — Verdict: **PARTIAL** (résidus SSE dormants présents, mais le claim "619-1000 LOC dead code" est partiellement faux : la majorité est du code LIVE feature-flaggé)
  - Preuve:
    - `museum-frontend/features/chat/infrastructure/sseParser.ts` EXISTE, git-tracked, **81 LOC**.
    - `museum-frontend/features/chat/infrastructure/chatApi/stream.ts` EXISTE, git-tracked, **214 LOC** — importé par `chatApi/index.ts:27,36,63` et `chatApi/send.ts:14`.
    - `museum-frontend/features/chat/application/sendStrategies/sendMessageStreaming.ts` EXISTE, git-tracked, **185 LOC** — **LIVE** : c'est la stratégie d'envoi PAR DÉFAUT (fall-through `useChatSession.ts:209-214`, importée `useChatSession.ts:25`).
    - `museum-frontend/tests/sse-parser.test.ts` EXISTE, git-tracked, **139 LOC**.
    - `museum-frontend/__tests__/infrastructure/chatApi.test.ts` EXISTE, git-tracked, **1061 LOC** (contient des blocs SSE, mais aussi les tests du path sync vivant).
    - **Gate runtime** : `send.ts:178` `if (!isChatStreamingEnabled()) return deps.postMessage(params);`. `isChatStreamingEnabled()` (`_internals.ts:60-64`) lit `EXPO_PUBLIC_CHAT_STREAMING`, **default `false`** (commentaire `_internals.ts:56-58` "streaming path deactivated post-V1, ADR-001"). `.env.example:19` + `.env.local.example:30` = `false`. Donc `sseParser.ts` + `stream.ts` (postMessageStream) sont **dormants tant que le flag n'est pas set** ; `sendMessageStreaming.ts` retombe sur le POST sync (commentaire vivant `sendMessageStreaming.ts:120` "The BE today returns sync (SSE deprecated), so this is the live path").
    - **FALSE-CLAIM partielle** : la doc dit `streaming.e2e.test.ts(refs fichier supprimé)`. (a) Aucun `streaming.e2e.test.ts` n'existe côté FE (`git ls-files | grep streaming.e2e` → uniquement `museum-backend/tests/e2e/streaming.e2e.test.ts`). (b) Le fichier BE est conditionnellement skippé (`streaming.e2e.test.ts:9-11` `SSE_ROUTE_DEACTIVATED=true`), PAS un "ref fichier supprimé" — il référence `chat-message.sse-dormant.ts` (commentaire `:4`) qui, lui, **n'existe pas** sur disque (commentaire stale, pas un import cassé).
  - Ref vérifiée: `dev`
  - Action roadmap: ❌→⚠️ — reste P0 MAIS requalifier. `sendMessageStreaming.ts` (185) n'est PAS du dead-code (LIVE default). Les vrais résidus dormants = `sseParser.ts` (81) + `stream.ts` (214) + `sse-parser.test.ts` (139) + blocs SSE de `chatApi.test.ts` + l'option `EXPO_PUBLIC_CHAT_STREAMING`. Burial réel ≈ **434 LOC source/test** (pas 619-1000) si décision = enterrer le flag streaming. Si décision = garder le flag pour V2.1 (cohérent avec ADR-001 + streaming.e2e BE "wired to revive V2.1"), alors **rien à enterrer** = doctrine UFR-016 ne s'applique pas (pas mort, gelé). Corriger le claim "refs fichier supprimé" (faux).
  - Confiance: haute

- **P0.D2** — Verdict: **OPEN**
  - Preuve: `git ls-files --error-unmatch museum-backend/reports/stryker-incremental.json` → **TRACKED** (présent dans l'index). Taille disque **18 496 564 bytes (≈18.5 MB)**, **397 976 lignes**. `.gitignore:227` contient `museum-backend/reports/` → le fichier a donc été **force-added malgré .gitignore** (exactement le claim doc). `git rm --cached` PAS fait.
  - Ref vérifiée: `dev`
  - Action roadmap: ❌ reste P0 — `git rm --cached museum-backend/reports/stryker-incremental.json` + commit. .gitignore couvre déjà (ligne 227), pas de bump nécessaire (claim doc "bump .gitignore" déjà satisfait par `museum-backend/reports/`).
  - Confiance: haute

- **P0.D3** — Verdict: **OPEN**
  - Preuve: tous les résidus existent ET sont git-tracked, ZÉRO wiring runtime :
    - `museum-backend/src/modules/chat/adapters/secondary/guardrails/llama-prompt-guard.adapter.ts` EXISTE, **180 LOC** (`wc -l`).
    - `museum-backend/tests/unit/chat/llama-prompt-guard.adapter.test.ts` EXISTE, **338 LOC**.
    - `museum-backend/docker-compose.llama-prompt-guard.yml` EXISTE, **53 LOC** (référence un `ops/llama-prompt-guard-sidecar/Dockerfile` à autoriser — service `llama-prompt-guard:8082`).
    - **Pas de wiring** : `grep "LlamaPromptGuard\|llama-prompt-guard\|PromptGuard" chat-module.ts` → **0 hit**. Les seules références non-test dans `src/` = le fichier adapter lui-même + `guardrail-provider.port.ts:123` qui est un **commentaire JSDoc** (`e.g. 'llama-prompt-guard-2-86m'`), pas du wiring.
    - Stubs env présents : `src/config/env.ts:445-447` lit `LLAMA_PROMPT_GUARD_BASE_URL` / `_TIMEOUT_MS` / `_SCORE_THRESHOLD` (config câblée mais l'adapter n'est jamais instancié/branché dans le pipeline). Le docker-compose stub n'est référencé nulle part ailleurs (CI/scripts) — `grep docker-compose.llama-prompt-guard` → seulement lui-même.
  - Ref vérifiée: `dev`
  - Action roadmap: ❌ reste P0 — DÉCISION LOCKÉE=DELETE (W6.1 `[x]` lock=DELETE, ADR-051). Supprimer adapter (180) + test (338) + docker-compose (53) + 3 lignes env.ts:445-447 + corriger JSDoc port:123. Zéro wiring conditionnel cassé (adapter non instancié). Burial = **~571 LOC + 3 env lines**.
  - Confiance: haute

- **P0.D4** — Verdict: **OPEN** (pour les 3 `describe.skip` inconditionnels) + **FALSE-CLAIM** (pour `streaming.e2e.test.ts`)
  - Preuve:
    - `museum-backend/tests/unit/chat/art-keyword-repo-atomic-upsert.test.ts:17` → `describe.skip('TypeOrmArtKeywordRepository.upsert (atomic)', …)` **INCONDITIONNEL** (literal `.skip`, pas `shouldRun ? describe : describe.skip`). **59 LOC**.
    - `museum-backend/tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts:22` → `describe.skip('AddCriticalChatIndexesP01777568348067 migration', …)` **INCONDITIONNEL**. **86 LOC**.
    - `museum-backend/tests/unit/data/db/migrations/AddP1FKAndTokenIndexes.spec.ts:25` → `describe.skip('AddP1FKAndTokenIndexes1777617893834 migration', …)` **INCONDITIONNEL**. **93 LOC**.
    - Total des 3 = **238 LOC** (= claim doc exact).
    - **FALSE-CLAIM streaming.e2e** : `museum-backend/tests/e2e/streaming.e2e.test.ts:11` est `const describeE2E = shouldRunE2E ? describe : describe.skip;` → **CONDITIONNEL** (pattern E2E standard, gated `RUN_E2E` + `SSE_ROUTE_DEACTIVATED`), PAS un `describe.skip` inconditionnel dead-on-arrival. La doc le range à tort avec les 3 hard-skips.
  - Ref vérifiée: `dev`
  - Action roadmap: ❌ reste P0 pour les 3 hard-skips (238 LOC) — soit câbler sous un gate conditionnel (`shouldRunIntegration ? describe : describe.skip`) comme les autres specs migration/integration du repo, soit supprimer. Retirer `streaming.e2e.test.ts` de la liste D4 (faux positif : c'est un E2E gated, cohérent avec D1 streaming dormant).
  - Confiance: haute

- **P0.D5** — Verdict: **PARTIAL** (PURE-DOC ; la rotation TECH_DEBT est DONE-DEV, mais 2 sous-items doc restent OPEN)
  - Preuve:
    - **Rotation TECH_DEBT = DONE-DEV** : TD-17/18/19/28/30/RN-01/RN-03/52/LF-02 sont tous `~~strikethrough~~ (fermé, archivé 2026-05-21 sweep multi-agent)` dans `TECH_DEBT.md` (lignes 207-209, 315, 327, 635, 835, 850, 1055) ET ont une entrée dans `TECH_DEBT_ARCHIVE.md` (lignes 384, 401, 420, 457, 469, 478, 535, 550, 969). Doc-anchor `#archivé-2026-05-21-sweep-multi-agent` **résout** (`TECH_DEBT_ARCHIVE.md:378` `## Archivé 2026-05-21 (sweep multi-agent)`). TD-47 reste intentionnellement OUVERT (`TECH_DEBT.md:573`, re-scopé RSC). TD-20 résolu (`:212`) avec TD-20a/20b notés OUVERTS (cohérent piège #6). → cette partie de D5 est **fermée**.
    - **OPEN #1 — ADR-036 §50 v1→v2** : code = `llm:v2:` (`llm-cache.service.ts:119`), mais `docs/adr/ADR-036-llm-cache-strategy.md:15` et `:56` disent encore `llm:v1:{contextClass}:…`. **STALE non corrigé.**
    - **OPEN #2 — ref obsolète `AiDisclosureModal`** : le composant réel est `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx` (EXISTE) ; **aucun** `AiDisclosureModal.tsx` n'existe sur disque. La ref obsolète persiste dans `docs/legal/AI_DISCLOSURE_AUDIT.md:51,63,91` (cible nommée par la doc D5), `docs/legal/AI_DISCLOSURE.md:13,24,42` et `docs/adr/ADR-055-…:21`. **Non corrigé.**
  - Ref vérifiée: `dev`
  - Action roadmap: ❌→⚠️ — la rotation (gros du travail) est faite ; reste 2 corrections PURE-DOC : (a) ADR-036 lignes 15+56 `v1`→`v2` ; (b) remplacer `AiDisclosureModal` par `AiDisclosureSheetContent` dans AI_DISCLOSURE_AUDIT.md (3 occ) + AI_DISCLOSURE.md (3 occ) + ADR-055 (1 occ). Exemption pipeline /team possible (pure-doc).
  - Confiance: haute

- **TD-AS-01** — Verdict: **OPEN** (PARTIAL côté code — namespacing incohérent, codemod global PAS fait)
  - Preuve: `docs/TECH_DEBT.md:1259` `🚨 TD-AS-01 — async-storage key namespacing inconsistent 11 prefixes (HIGH, NICE_TO_HAVE pre-V1)` "24 keys across 11 prefix families … Fix : codemod to `musaium.<feature>.<key>` convention avec migration reader." **Marqué OUVERT.** (Note : doc-anchor cité dans la tasklist = `TECH_DEBT.md:1251`, l'entrée est en réalité à `:1259` — drift mineur, entrée présente.)
    - Code = **préfixes mixtes, codemod non appliqué**. Clés `musaium.`-namespacées (≈20, surtout stores Zustand persist) : `musaium.audioDescription` (`audioDescriptionStore.ts:53`), `musaium.userProfile`, `musaium.dataMode.preference`, `musaium.runtimeSettings`, `musaium.chatLocalCache`, `musaium.offline.queue`, `musaium.artKeywords`, `musaium.offlineMaps.autoPreCacheEnabled`, `musaium.voice.disclosure_acknowledged.<sid>`.
    - Clés **NON** conformes (raw / autres préfixes) encore live : `app.themeMode` (`ThemeContext.tsx:16`), `runtime.defaultLocale|defaultMuseumMode|guideLevel|apiBaseUrl|apiEnvironment` (`runtimeSettings.ts:18-24`, 5 clés), `settings.resumption_banner_dismissed_until` (`useResumableSession.ts:18`), `museum.lastCameraView.v1` (`mapCameraCache.ts:3`), `@musaium/saved_artworks` + `@musaium/daily_art_dismissed` (`useDailyArt.ts:6-7` — préfixe `@musaium/`, PAS `musaium.<feature>.`).
  - Ref vérifiée: `dev`
  - Action roadmap: ❌ reste P0/HIGH — codemod `musaium.<feature>.<key>` sur ≥9 clés non conformes + migration reader (anciennes clés → nouvelles). Cross-ref DOMAINE 8 (8a) qui inventorie le statut TECH_DEBT.
  - Confiance: haute
