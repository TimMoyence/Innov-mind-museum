# L28 — C-cluster NOW résiduels + NEXT V1.1 sanity

Audit READ-ONLY fresh-context (UFR-022). `dev` @ HEAD `1fb32f5ba`. Re-dérivé from scratch, code-confirmed (path:line). Aucune confiance aux marqueurs antérieurs.

---

## A) C — Cluster items NOW résiduels (roadmap L320-327)

| Item | Roadmap claim | VERDICT | Évidence |
|---|---|---|---|
| **C1.1** Grafana per-stage STT/LLM/TTS | `[x]` DONE `f6335fe52` | ✅ **DONE confirmé** | Dashboard `infra/grafana/dashboards/chat-stages-latency.json` existe ; métrique `chat_phase_duration_seconds` → `museum-backend/src/shared/observability/prometheus-metrics.ts:54`. Nit : commit `f6335fe52` message réel = "feat(w4): audit-360 ..." (pas le libellé dashboard-spécifique impliqué) — artefacts présents, claim valide. |
| **C1.3** Optim data-driven | `[ ]` après baseline ≥7j | ✅ **NOT done (by design)** | Tuning post-bake ≥7j prod. Référencé `docs/adr/ADR-036-llm-cache-strategy.md:27` ("baseline before any data-driven TTL tune"). Aucun marqueur done parasite. Correct. |
| **C4.2** Threshold confidence tuning (LLM judge V2) | `[ ]` calibrer sur dataset prod (V1.1) | ✅ **NOT done (by design)** | Service présent (`guardrail-evaluation.service.ts`) mais tuning = calibration sur dataset prod réel, intrinsèquement post-launch. Correct. |
| **C8.1-C8.6** VDP/CRA (security@ mailbox, CNIL, ENISA SRP, CERT-FR, PGP, renewal cal) | `[ ]` | ✅ **NOT done** (tâches ops/Tim hors-code, non re-vérifiables in-tree) | Hors périmètre code. Note : PGP key = placeholder `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` (cf. CLAUDE.md gotcha), cohérent avec "non-fait". |
| **C9.8** Activate Presidio adapter | `[ ]` "code wired conditional `chat-module.ts:11,441-445`, **manque sidecar Dockerfile + docker-compose**. Pas P0 V1." | ⚠️ **ANOMALIE — claim partiellement périmé** | **docker-compose EXISTE** : `museum-backend/docker-compose.presidio.yml` (overlay opt-in, images officielles `mcr.microsoft.com/presidio-analyzer` + `-anonymizer`, healthchecks). **Pas de Dockerfile custom nécessaire** (images upstream). Adapter wiré conditionnel : `chat-module.ts:11` (import) + `:443-454` (`buildGuardrailProvider` → `if (env.guardrails.presidio.enabled && env.guardrails.presidio.baseUrl)` → `new MicrosoftPresidioAdapter`). Env config : `env.ts:433-443` (`PRESIDIO_ENABLED`/`PRESIDIO_BASE_URL`/`PRESIDIO_TIMEOUT_MS`), types `env.types.ts:604`. **L'activation = juste env flags + démarrer l'overlay** — l'item est donc « infra prête, dormant par décision V1.1 », PAS « manque l'infra ». **Item reste légitimement NOT-done** (décision : différé V1.1, regex email/phone couvre 95% RGPD V1) mais le libellé « manque sidecar/compose » est faux. **Incohérence interne** : le header du compose (L10-14) dit lui-même « adapter NOT wired in chat-module.ts pre-launch » → contredit le code réel (adapter EST wiré conditionnel). Doc/header à corriger. |
| **C9.18** Deep-link artworkId | `[ ]` fallback `/museum-detail` shipped, route canonique = TD-NEW V1.1 | ✅ **NOT done confirmé** | Aucune route `museum-frontend/app/.../museum/[id]/artwork/[artworkId]`. Seul `app/(stack)/museum-detail.tsx` (fallback) existe. `+native-intent.tsx` (29 LOC) ne route pas artworkId. `sanitizeCartelCode.ts:144-165` parse bien `{museumId, artworkId, roomId}` côté validation mais pas de route canonique consommatrice. Correct. |

**Synthèse A** : C1.1 done OK. C1.3/C4.2/C8.x/C9.18 correctement non-faits. **Seule anomalie : C9.8** — le compose Presidio existe déjà (libellé "manque docker-compose" périmé) ; l'item reste à juste titre non-activé (décision V1.1) mais devrait être recadré « infra prête, activation env-only différée V1.1 ». Header du compose (L10-14) STALE (dit adapter non-wiré alors qu'il l'est conditionnel).

---

## B) NEXT V1.1 sanity (roadmap L331-389)

### W5 — Voice decision review
- **W5.1** `[ ]` décision WebRTC post-launch → ✅ NOT done (décision future, par nature). Correct.

### W6 — Chat backend modernization
| Item | Claim | VERDICT | Évidence |
|---|---|---|---|
| W6.1 Llama-Prompt-Guard wire vs delete | `[x]` DELETE V1 (P0.D3) | ✅ DONE/decided OK | Adapter dormant supprimé Lot 6 (non re-vérifié en détail, hors scope deep-dive — décision lockée). |
| W6.2 Localiser system prompt FR/JA/ZH/AR | `[ ]` | ✅ **NOT done** | Aucun `buildSystemPrompt_fr/_ja/_zh/_ar` dans `museum-backend/src`. Correct. |
| W6.3 tsvector + RRF hybrid search | `[ ]` | ✅ **NOT done** | Zéro hit `tsvector`/`RRF`/`ts_rank` dans `museum-backend/src`. Correct. |
| W6.4 Anthropic provider + prompt caching | `[ ]` | ✅ **NOT done** | `pnpm list @langchain/anthropic` → "no @langchain/anthropic dep". Aucun `ChatAnthropic`/`anthropicPromptCaching`. Correct. |
| W6.5 Folder refactor chat 44→33-35 | `[ ]` | ✅ NOT done (refactor non-entamé ; non deep-divé). |
| W6.6 Few-shot examples | `[ ]` | ✅ NOT done (cohérent W6.2 ; non deep-divé). |
| W6.7 promptfoo per-locale 50×10 | `[ ]` | ✅ NOT done (smoke 10-prompts reste l'état actuel). |
| W6.8 LangChain Langfuse callback handler | `[ ]` | ✅ NOT done (wrap manuel `withLangfuseTrace` toujours en place ; non deep-divé). |
| **W6.9** FE↔BE distributed tracing | `[x]` shipped 2026-05-17 | ✅ **DONE confirmé** | BE : `museum-backend/src/shared/observability/trace-propagation.middleware.ts` existe. FE : `museum-frontend/shared/observability/sentry-init.ts:21,40` (`tracePropagationTargets`). Marquage `[x]` correct. |
| **W6.10** Guardrail fairness dashboard | `[x]` 10 panels | ✅ **DONE confirmé** | `infra/grafana/dashboards/guardrail-fairness.json` ; **count = 10 panels** (vérif `json.load → len(panels)==10`). Matche exactement le claim. Marquage `[x]` correct. |
| W6.11 LLM_CACHE_ENABLED kill-switch | `[ ]` | ✅ **NOT done** | Aucun `LLM_CACHE_ENABLED`/`cacheEnabled` dans `env.ts`. Correct. |
| W6.12 Grafana `llm_cache_hit_ratio` panel | `[ ]` | ✅ **NOT done** | Aucun panel `llm_cache_hit_ratio`/`llm_prompt_cache_hit_ratio` dans `infra/grafana/dashboards/`. Correct. |

### W7 — Voice persona + dynamic UX
- **W7.1** Multi-persona 3 personas → ✅ **NOT done**. Aucun `TTS_VOICE_MAP`/`CuratorPersona`/`personaPrompt`. Correct.
- **W7.2** Dynamic WelcomeCard → ✅ **NOT done**. `WelcomeCard.tsx:33-42` utilise toujours les **3 boutons fixes** (`welcome.suggestions.*`) ; aucun `useDynamicSuggestions`. Correct.
- **W7.3** Mid-conversation idle nudge → ✅ **NOT done**. Aucun `idleNudge`/`onIdle` dans `features/`/`shared/` (seul hit = node_modules faker). Correct.

### B2B polish
- Multi-tenant scoping all admin routes → ✅ NOT done (P0.C9 deferred ; scoping partiel CSV-only, conforme au libellé).
- NPS true 0-10, Admin hard-delete, drop dead 409/userName, Rate-limit Brevo per-pod, B2B page i18n → ✅ NOT done (cohérent, non deep-divés individuellement).
- **OpenAPI spec `/leads/*` paths missing** → ✅ **NOT done confirmé** : routes `leads` EXISTENT en code (`museum-backend/src/modules/leads/adapters/primary/http/routes/leads.route.ts`) mais `python3 json.load(openapi.json) → paths contenant "lead" = NONE`. Le gap (code sans spec) est réel. Correct.

### Sécurité hardening
| Item | VERDICT | Évidence |
|---|---|---|
| **Sentry `event.tags` walked by `scrubEvent` — "currently bypassed"** | ❌ **ANOMALIE — SECRÈTEMENT DONE** | `scrubEvent` (shared) **walke event.tags** : `packages/musaium-shared/src/observability/sentry-scrubber.ts:212-232` (R2 2026-05-21) — `scrubRecord(next.tags)` + `SENSITIVE_HEADER_REGEX` redaction + `scrubUrl` sur valeurs URL-like. Consommé BE via `sentry.ts:69` (`beforeSend: scrubEvent`). Le claim « currently bypassed » est **FAUX**. Item à cocher `[x]` ou retirer. |
| Hash-at-write IP via HMAC | ✅ NOT done | Aucun `hashIp`/HMAC-IP at-write (anonymize cron 13mo reste l'état). Correct. |
| Zero-width strip in user-message path | ✅ NOT done | Aucun `stripZeroWidth`/strip `\u200x` dédié sur le chemin user-message guardrail. Correct (bypass `payloads.ts:37` toujours documenté). |
| Homoglyph fold `confusables` | ✅ NOT done | `pnpm list confusables` → "no confusables dep". Correct. |
| Locale re-validation aux boundaries | ✅ NOT done (non deep-divé, cohérent). |
| History re-sanitization on retrieval | ✅ NOT done | Hits "pre-sanitised" = titres artwork (`llm-prompt-builder.ts:88`, `chat-orchestrator.port.ts:81`), PAS re-sanitization d'historique au retrieval. Correct. |
| Cross-museum QR replay fix | ✅ NOT done (validation `sanitizeCartelCode` présente mais fix FE→BE museumId scope-check non shippé ; cohérent). |
| Audit chain ADR-054 Phase 1+2 | ✅ NOT done (refonte Merkle = V1.2). |
| Privilege escalation super_admin promotion guard | ✅ NOT done | `super_admin` checks présents pour EXPORTS (`exportSupportTickets.useCase.ts:35` etc.) mais pas de guard "comparison de privilège lors d'une promotion to super_admin". Correct (claim spécifique = promotion path). |

### Personnalisation Spec C deferred / Premium full
- LanguagePreference toast FE, SessionDuration P90, Stripe/IAP → ✅ NOT done (BE-only ou conditionnés data stub). Cohérent.

---

## Anomalies récapitulées

1. **C9.8 (NOW résiduel)** — libellé « manque sidecar Dockerfile + docker-compose » **PÉRIMÉ** : `museum-backend/docker-compose.presidio.yml` existe (images officielles MS, pas de Dockerfile custom requis), adapter wiré conditionnel (`chat-module.ts:443-454`), env câblé (`env.ts:433-443`). Item reste légitimement non-activé (décision V1.1) mais à recadrer « infra prête, activation env-only différée ». Header du compose (L10-14) STALE (prétend adapter non-wiré).
2. **Sécu hardening — Sentry `event.tags`** — **SECRÈTEMENT DONE**. `scrubEvent` walke bien `event.tags` depuis 2026-05-21 (`packages/musaium-shared/src/observability/sentry-scrubber.ts:220-231`, consommé `sentry.ts:69`). Claim « currently bypassed » FAUX → cocher `[x]`.

Aucun autre item NEXT secrètement done. W6.9/W6.10 correctement `[x]` (confirmés). Tous les `[ ]` W6.2/3/4/11/12, W7.1/2/3, B2B `/leads`, et le reste sécu = correctement non-faits.
