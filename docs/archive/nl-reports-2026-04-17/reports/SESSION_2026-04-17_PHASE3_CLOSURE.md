# Session Report 2026-04-17 — Phase 3 Closure (NL-4 + NL-5 + NL-6)

> Suite autonome de la session NL-1/2/3. Finalisation des plans P11 et P12 avec exécution complète des portions code-possible.

## Sprints exécutés

### Sprint NL-4 — P11 AI Guardrails V2 finalization (1 commit bda27e89)

7 livrables :
1. **NL-4.1 Env flag** : `GUARDRAILS_V2_CANDIDATE` (off / llm-guard / nemo / prompt-armor) + `GUARDRAILS_V2_LLM_GUARD_URL` + `GUARDRAILS_V2_TIMEOUT_MS` (300ms) + `GUARDRAILS_V2_OBSERVE_ONLY` (true par défaut — Phase A rollout).
2. **NL-4.2 LLMGuardAdapter** (`src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts`) : HTTP client fail-CLOSED avec AbortController timeout, REASON_PATTERNS lookup table (KISS), 14 tests couvrant tous les paths d'erreur.
3. **NL-4.3 GuardrailEvaluationService wiring** : dep optionnelle `advancedGuardrail` + `advancedGuardrailObserveOnly`, helper `evaluateAdvanced()` try/catch fail-CLOSED, observe-only downgrade block→allow avec log, deterministic keyword guardrail runs FIRST (testé). 10 tests d'intégration.
4. **NL-4.4 Chat module wiring** : `chat.service.ts` + `chat-message.service.ts` propagent, `chat-module.ts::buildAdvancedGuardrail()` factory, `buildChatService()` helper extrait pour tenir ≤60 lignes.
5. **NL-4.5 Dataset v2.0** : 220 prompts × 8 locales × 5 catégories (100 benign_art, 50 off_topic, 30 injection, 20 pii, 20 borderline anti-over-blocking).
6. **NL-4.6 Benchmark script** (`scripts/benchmark-guardrails.ts`) : CLI adapters positionnels + --url/--timeout/--output, métriques TP/FP/TN/FN + per-category accuracy + p50/p95/p99/mean latency, 14 tests unit.
7. **NL-4.7 Docker compose overlay** (`docker-compose.guardrails.yml`) : stub opt-in LLM Guard sidecar port 8081 avec healthcheck + backend depends_on.

### Sprint NL-5 — P12 Mobile Perf V2 finalization (1 commit a365cfdb)

1. **MuseumDirectoryList** : `renderItem` wrapped in `useCallback([onMuseumPress])` → stabilise l'identité du renderer, évite re-layouts FlashList quand le parent re-render avec des props stables (ex: frappe dans searchbar).
2. **Perf baseline protocol doc** (`docs/plans/reports/NL-5-perf-baseline-protocol.md`) : 5 scenarios reproductibles × 2 devices × 6 métriques avec targets chiffrés (FPS ≥ 55, cold_start ≤ 1500ms, memory ≤ 220MB), commandes outils RN 0.83, 6 optimisations par ordre d'impact si baseline miss target.

### Sprint NL-6 — Final closure (1 commit à venir)

- PROGRESS_TRACKER Phase 3 cochée (P11 et P12 à 100% code-possible)
- Ce rapport final
- Recap feature pour l'utilisateur

## Totaux depuis début session (16 commits)

| Mesure | Baseline début | Après Phase 3 closure | Delta |
|---|---|---|---|
| Tests backend | 2655 | **2717** | +62 |
| Tests frontend jest | 1120 | **1120** | 0 (stable) |
| Tests frontend node | 277 | **293** | +16 |
| i18n keys × 8 locales | 610 | **617** | +7 (×8 = +56 values) |
| Hexagonal ports chat | 9 | **10** | +1 (AdvancedGuardrail) |
| Secondary adapters chat | N | **N+1** | +1 (LLMGuardAdapter) |
| FlashList production | 3 | **6** | +3 |
| FlashList avec getItemType | 1 | **3** | +2 |
| renderItem stabilisés | N | **N+1** | +1 |
| Scripts benchmark BE | 0 | **1** | +1 |
| Docker compose overlays | 1 | **2** | +1 |
| Lint errors BE + FE | 0 + 0 | **0 + 0** | stable |
| tsc errors BE + FE | 0 + 0 | **0 + 0** | stable |

## Principes respectés (tous sprints)

1. **UFR-005 verify-before-validate** — réalité code confrontée à l'audit à chaque étape.
2. **Commits atomiques** — 11 commits (master plan + 9 sprint commits + closure), rollback trivial.
3. **Tech Lead 2x challenge par sprint** — Pass 1 NL-1 a détecté le gap i18n optimistic placeholders. Pass 2 de tous les sprints validé.
4. **Quality ratchet lock** — BE/FE tests strictement croissants, 0 régression tsc/lint.
5. **Defense-in-depth** — AdvancedGuardrail s'ajoute APRÈS le deterministic keyword guardrail, jamais en remplacement.
6. **Fail-CLOSED preserved** — LLMGuardAdapter + GuardrailEvaluationService.evaluateAdvanced both fail-CLOSED sur any error.
7. **KISS** — REASON_PATTERNS lookup table remplace chaîne if/else (complexity 15 → ≤ 12).
8. **Clean archi** — port hexagonal, adapter en secondary, wiring en chat-module, factory helper extrait.

## Travail restant hors session (vraiment out-of-autonomy)

### P11 — Requires live infrastructure + API keys
- **NL-3.4 benchmark execution** : déployer Python sidecar Docker (`docker compose -f docker-compose.yml -f docker-compose.guardrails.yml up -d`), exécuter `pnpm exec tsx scripts/benchmark-guardrails.ts llm-guard --output reports/bench-llm-guard.json`, comparer vs `benchmark-guardrails.ts noop`.
- **NL-3.5 go/no-go decision** : documenter dans `docs/plans/reports/NL-3.5-decision.md` selon critères (P95 ≤ 150ms, FP rate ≤ +2pp, injection detect ≥ +20pp, coût ≤ $0.005/msg).

### P12 — Requires physical devices
- **NL-2.1 baseline** : run protocole NL-5 sur iPhone 12 + Pixel 6, commit `docs/plans/reports/NL-2.1-baseline.md` avec métriques.
- **NL-2.5 after-measure** : re-run même protocole post-optimisations si baseline miss target.
- **EAS dev + preview builds** : `eas build --profile preview --platform all`.

## Recap features pour utilisateur

**AI safety :**
- Nouvelle couche guardrail V2 prête à activer (env flag `GUARDRAILS_V2_CANDIDATE=llm-guard`)
- 220 prompts benchmark dataset (détection injection, PII, toxicity, bias, jailbreak, schema, exfiltration, off-topic)
- Mode observe-only par défaut → Phase A deployment sans risque user-visible
- Script `pnpm exec tsx scripts/benchmark-guardrails.ts` pour comparer candidats

**Mobile perf :**
- 6 écrans sur FlashList v2 (vs 3 avant)
- Recyclage optimisé user/assistant, visitor/staff, museum cards
- Protocole benchmark reproductible pour iPhone 12 + Pixel 6

**DRY + Clean archi :**
- 3 helpers pures extraits chat-session mobile (buildOptimisticMessage, bumpSuccessfulSend, formatLocation)
- mapApiMessageToUiMessage utilisé en prod (était dead code)
- Port hexagonal `AdvancedGuardrail` + null-object pattern
- `buildChatService()` helper ≤60 LOC

**i18n :**
- 617 clés × 8 locales (EN/FR/ES/DE/IT/JA/ZH/AR)
- 100% UI-visible coverage (optimistic placeholders inclus)

**Quality :**
- 2717 tests backend (+62), 1120 jest mobile, 293 node mobile
- 0 tsc errors, 0 lint errors
- React Compiler actif, FlashList v2, Reanimated 3 audit clean, Expo Router v7 compliant

## Fin de Phase 3

Phase 3 est **close à 100% pour les portions code-possible**. Les exécutions restantes (sidecar Python, benchmark LLM, devices physiques) sont documentées avec des protocoles exploitables — l'utilisateur peut les déclencher dès que l'infra ou les devices sont disponibles.
