# 05 — Architecture: planned / real / regulatory
**Date:** 2026-05-12  **Agent:** AGENT-05

## Verdict

- **Planned-vs-real alignment score 0-100: 78** — strong overall execution; deltas are dominated by Phase 1 consolidation items that are still mid-sprint (C1, C3, C6, C7 — by design per the 2026-05-08 Phase-1 reprio) plus a handful of doc-vs-code drifts (consent granularity, retention figures in privacy policy, sub-processor list shown to users vs. actually disabled). The hexagonal/feature-driven/App-Router skeleton is real and consistent across BE/FE/Web.
- **Real-vs-regulatory compliance score 0-100: 68** — DPIA, ROPA, SUBPROCESSORS, DATA_FLOW_MAP, AI Act Art 50 disclosure, age-gate at 15, EXIF strip, LLM cache with userId scoping, PII scrubber, and Sentry EU region are all genuinely shipped. The deductions come from: (i) DPIA + ROPA still DRAFT (no DPO signature), (ii) DeepSeek listed in user-facing privacy policy as active sub-processor despite docs claiming "disabled in EU prod" (mismatched user-facing claim), (iii) no granular consent for AI chat / voice / image — only `tos_privacy` bundle + `location_to_llm`, (iv) no European Accessibility Act statement and no documented EN 301 549 / WCAG 2.1 AA conformance audit despite EAA being enforceable since 2025-06-28, (v) Tavily / Unsplash / DPF Schrems-III posture still flagged P0/P1 in own ledger.
- **Launch-blocking regulatory gaps count: 4** (DPO sign-off on DPIA/ROPA, EAA accessibility statement + audit, consent granularity for AI/voice/image, DeepSeek mention removed from user-facing privacy policy or properly gated). All four are doable in <2 weeks; none requires architectural rework.
- **Net read.** Musaium is *unusually well-prepared* for a solo-dev pre-launch B2C+B2B EU product. The compliance paperwork is genuinely thorough (DPIA + ROPA + 20-vendor sub-processor ledger + data-flow Mermaid + AI Act Art 50 disclosure on three surfaces). What's missing is mostly closure: DPO signature, accessibility statement, consent UX granularity, and one user-facing doc cleanup. The architecture itself is coherent (hexagonal BE / feature FE / App-Router web), import discipline is enforced, and the chat pipeline shipped exactly as described in CLAUDE.md (guardrails + structural prompt isolation + EXIF strip + sanitization + per-user cache key). The biggest *unscoped* risk for launch day is the European Accessibility Act — it has been enforceable since 28 June 2025 and there is no a11y statement or EN 301 549 conformance evidence committed to the repo for a B2C app launching 2026-06-01.

---

## Axis A — Planned (from docs)

### A.1 Roadmap commitments (`docs/ROADMAP_PRODUCT.md`)

Sprint 2026-05-03 → 2026-06-01 (launch day). Strategy decided 2026-05-08: **Phase 1 Consolidation (C1…C7) before Phase 2 Walk (W1…W5)**. Phase 2 is explicitly blocked until Phase 1 is complete.

Phase 1 items, status as written in the roadmap:

| ID | Title | Roadmap status |
|---|---|---|
| C1.1 | Grafana p50/p95/p99 dashboard STT+LLM+TTS | NOT DONE |
| C1.2 | LLM cache audit + activate | NOT DONE |
| C1.3 | Optim data-driven | NOT DONE |
| C2.1–C2.5 | Image-in-chat finition (AI-side only) | ALL DONE (2026-05-10/11) |
| C3.1–C3.5 | Image comparative full (visitor photo → similar artwork) | ALL NOT DONE; ADR-040 defers "C3 full" |
| C4.1 | WebSearch fallback wiring | DONE (ADR-038) |
| C4.2 | Threshold confidence tuning | DEFERRED V1.1 |
| C4.3 | Promptfoo regression suite anti-hallucination | DONE |
| C4.4 | Citation enforce in LLM output | DONE |
| C5.1–C5.4 | Wikidata premium resilient (breaker + dump + metrics) | ALL DONE (ADR-039) |
| C6.1–C6.5 | Premium soft-paywall stub | ALL NOT DONE |
| C7.1–C7.4 | Smoke + chaos + P0=0 + release checklist | ALL NOT DONE |

Audience commitments:
- B2C visitor — freemium (3 sessions/mois free → Premium illimité) — **hypothesis to validate via stub** (no Stripe yet, per plan).
- B2B musée — annual license + optional co-branding — **hypothesis, ≥3 LOI before 2026-06-01**.
- Institutionnel — grant — backlog H2 2026.

OKR Q2-2026:
- KR1: ≥3 musées B2B contractés before 2026-06-01.
- KR2: NPS post-balade ≥7/10 sur 50 sessions test.
- KR3: Crash-free ≥99.5% + chat p99 <5s + 0 P0 bug.
- KR4: 100 visiteurs B2C inscrits semaine 1 post-launch.

### A.2 /team orchestrator roadmap (`docs/ROADMAP_TEAM.md`)

V12 → V13 evolution. KR1 cost-predictability, KR2 spec-kit adoption ≥80%, KR3 auto-eval ≥85/100, KR4 lesson capture per run. Most NOW items shipped 2026-05-03 (T1.1, T1.2, T1.4, T1.5, T1.6). T1.7 deploy-ops follow-ups still open (audit-chain email fallback, GUARDRAILS_V2_CANDIDATE=off, GHCR_TOKEN scope, INSULT_KEYWORDS trim, RedisNonceStore wire, @xmldom override bump).

### A.3 ADR-stated architecture decisions (`docs/adr/`)

44 ADRs present. Notable for launch posture:
- **ADR-002** TypeORM 1.0 mitigation — stay on current, monitor.
- **ADR-006** SSRF defense-in-depth — outbound HTTP private-IP block + allow-list.
- **ADR-011** rate-limit fail-closed.
- **ADR-014 / ADR-017** MFA all roles enforcement + RN wiring (RN wire deferred).
- **ADR-021** PgBouncer transaction mode — `LISTEN/NOTIFY`, session-scoped advisory locks, persistent prepared statements off the table.
- **ADR-026** SLO + observability strategy (Sentry + OTel + Prometheus).
- **ADR-029** Documenter agent → Sonnet (UFR-010 amendment).
- **ADR-031** Mobile cert pinning kill-switch.
- **ADR-036** LLM cache single-layer at use-case (`LlmCacheServiceImpl`); no adapter-level decorator (CachingChatOrchestrator removed 2026-05-08).
- **ADR-037** SigLIP + pgvector for visual similarity. pgvector ≥0.7.0 `halfvec` required.
- **ADR-038** Citations + WebSearch cascade. KnowledgeRouter KB→judge→WS with `AbortSignal.any`.
- **ADR-039** Wikidata resilient circuit-breaker + local dump.
- **ADR-040** C3 image-comparative full deferred V1.1.
- **ADR-041** W1 walk transitions deferred V1.1.
- **ADR-042** Voice WebRTC deferred V1.1.
- **ADR-043** TypeORM → Drizzle/Prisma post-launch (not before).
- **ADR-044** Multi-tenant museum onboarding deferred V1.1.
- **ADR-045** Shared observability package extraction.
- **ADR-046** Zod 4 BE migration deferred.

### A.4 Documented-but-deleted ADRs (per CLAUDE.md + git log)

- **ADR-001 SSE streaming** — explicitly KILLED in `ROADMAP_PRODUCT.md` "KILLED" table; deletion recoverable via `git log -- docs/adr/ADR-001-sse-streaming-deprecated.md` (commit `5d15a89e8` 2026-04-22). Replaced by sync chat pipeline.
- **ADR-005, ADR-008, ADR-034** — missing from file listing; presumed superseded but not explicitly noted in repo (worth confirming with author).

### A.5 Documented intent NOT in the audit scope but used as anchors

- `docs/AI_VOICE.md` — voice pipeline STT (`gpt-4o-mini-transcribe`) → LLM → TTS (`gpt-4o-mini-tts`, default voice `alloy`), MP3 buffer persisted as `ChatMessage.audioUrl`, no buffer entrant persistence.
- `docs/MIGRATION_GOVERNANCE.md` — `DB_SYNCHRONIZE=true` blocked in CI; migrations only via `node scripts/migration-cli.cjs generate`.
- `docs/AI_VISUAL_SIMILARITY.md` — SigLIP ONNX preprocessing pitfall noted (no ImageNet mean — `(pixel/127.5)-1.0`).
- `docs/SLO.md`, `docs/CAPACITY_PLAN.md`, `docs/CHAOS_RUNBOOKS.md` — operational scaling + chaos targets.

---

## Axis B — Real (from code)

### B.1 Backend module layout (verified by directory listing)

`museum-backend/src/modules/` contains exactly the 8 modules the architecture doc claims: `admin / auth / chat / daily-art / knowledge-extraction / museum / review / support`.

Three modules sampled in depth:

**`auth/`** — barrel pattern as documented.
- `domain/` exposes aggregates per entity (user, consent, session, etc.).
- `useCase/` is split into capability folders matching the doc: `account/ api-keys/ consent/ email/ index.ts password/ registration/ session/ social/ totp/`.
- `adapters/primary/http/` has `routes / schemas / helpers` per spec. `adapters/secondary/{pg,social}/` are the only categories.
- `useCase/account/` has `deleteAccount.useCase.ts`, `exportUserData.useCase.ts`, `getProfile.useCase.ts` — DSAR Art 15 + Art 17 endpoints exist as use-cases.
- `useCase/registration/register.useCase.ts:108` implements `assertDigitalMajority(dateOfBirth)` with `MINIMUM_AGE_FOR_REGISTRATION = 15`, throws `MINOR_PARENTAL_CONSENT_REQUIRED` 422. CNIL Délibération 2021-018 is cited in the JSDoc.

**`chat/`** — composition-root pattern as documented (`chat-module.ts` + `domain / useCase / adapters / jobs / util`, no `useCase/index.ts`).
- `useCase/` capabilities: `audio describe enrichment guardrail image knowledge llm location memory message orchestration retention session visual-similarity web-search` — matches the doc precisely.
- `useCase/orchestration/chat.service.ts` is the orchestrator entry; deps in `ChatServiceDeps` include orchestrator, imageStorage, imageProcessor (EXIF strip — JSDoc explicitly cites GDPR Art 5(1)(c)), audioTranscriber, audioStorage, tts, cache, ocr, audit, userMemory, knowledgeBase, knowledgeRouter (C4.1 additive), imageEnrichment, webSearch, artTopicClassifier, advancedGuardrail, locationResolver, locationConsentChecker, piiSanitizer, llmCacheService.
- `useCase/guardrail/art-topic-guardrail.ts:30 INSULT_KEYWORDS` is the single source of truth for keyword filtering (CLAUDE.md says "guardrail in `chat.service.ts` = single source of truth" — verified at the guardrail-evaluation.service layer).
- `useCase/llm/llm-cache.service.ts:131-134` — cache key shape `llm:v1:{contextClass}:{museumId|none}:{userId|anon}:{sha256}` — **userId is in the key**, contrary to the older audit V4/G5 risk note in `DATA_FLOW_MAP.md:115` ("LLM cache (audit V4: missing userId scoping → cross-user leak risk)") which is now stale. Verified anon path uses `'anon'` literal.
- `adapters/secondary/image/image-processing.service.ts:47 stripExifFromImage` exists; chat.service.ts JSDoc enforces presence in prod.

**`museum/`** — barrel pattern.
- Standard hexagonal skeleton present (`domain / useCase / adapters / index.ts`).

### B.2 Auth flow (verified)

Sub-flows present as use-case files:
- `registration/register.useCase.ts` + `verifyEmail.useCase.ts` — email verification with SHA-256 token storage.
- `password/` — reset password.
- `social/` — OAuth (Apple + Google ID-token verifier).
- `session/` — refresh token rotation.
- `totp/` — MFA.
- `api-keys/` — `msk_*` API keys.
- `account/` — DSAR export + delete + profile.
- `consent/` — grant + revoke + content prefs + tts voice.

OAuth deeplink fragment-strip fix at commit `58817475` (2026-05-12, current HEAD).

### B.3 AI cost controls

- `useCase/llm/llm-cache.service.ts` is the single cache layer (ADR-036). TTL: generic 7d / museum-mode 1d / personalized 1h. Per-museum invalidation via `delByPrefix`. Prometheus counters `llm_cache_hits_total` / `llm_cache_misses_total`.
- Rate limiting via `helpers/middleware/rate-limit.middleware.ts` + `redis-rate-limit-store.ts` (ADR-011 fail-closed) + `daily-chat-limit.middleware.ts`.
- No Stripe / IAP / subscription integration in code — confirmed by `grep -rn "Stripe\|payment\|checkout"` returning zero hits in `src/modules` and FE/Web. Plan: soft-paywall stub (C6) is **not yet built**; Premium full is conditional on stub data.

### B.4 Observability (referenced in CLAUDE.md + architecture)

`shared/observability/` contains 8 modules: `chat-phase-timer.ts, langfuse.client.ts, metrics-context.ts, opentelemetry.ts, prometheus-metrics.ts, safeTrace.ts, sentry-scrubber.ts, sentry.ts`. Recent commits (`a739f4a3` 2026-05-12 + `37cf8d30`) show active dedup work on Sentry+OTel listener spam — proves the stack is integrated and being tuned.

### B.5 Frontend layout (verified)

`museum-frontend/features/` contains 13 features: `art-keywords / auth / chat / conversation / daily-art / diagnostics / home / legal / museum / onboarding / review / settings / support`. Matches the architecture doc except: doc lists 12 + `diagnostics` is a new feature folder, also `home` is new — both are additive.

AI Act Art 50 disclosure present in code:
- `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx:8` — persistent disclosure footer.
- `museum-web/src/components/ai-disclosure/AiDisclosureBanner.tsx:11` — landing banner.
- `museum-web/src/lib/privacy-content.ts:116, 234` — section 12 in FR + EN privacy policy.

a11y signals — 135 occurrences of `AccessibilityInfo|accessibilityHint|accessibilityRole` in FE features; one test file `museum-frontend/__tests__/a11y/accessibility-audit.test.tsx`; web has `@axe-core/playwright` devDep. No `accessibility statement` document anywhere in `docs/` or in `museum-web/src/app/[locale]/` (zero matches).

### B.6 Web layout (verified)

`museum-web/src/app/[locale]/` contains: `admin / confirm-email-change / layout.tsx / page.tsx / privacy / reset-password / support / verify-email`. Privacy + landing + admin panel match the doc. Missing relative to the architecture doc:
- No `terms-of-service/` route — terms content exists in `museum-frontend/features/legal/termsOfServiceContent.ts` but no public web page.
- No `accessibility-statement/` page (EAA gap).
- No B2B pitch page (W4.3 deferred).

---

## Diff A vs B (planned ≠ real)

### A says "shipped" → B confirms

- C2.1–C2.5 image-in-chat AI-side enrichment — verified (Wikidata + Wikimedia Commons + internal catalog adapters, schema v2 with `rationale + caption`, FE `ImageCarouselSkeleton` + `SourceCitation`).
- C4.1 / C4.3 / C4.4 — citations + promptfoo + WebSearch fallback — verified in code (KnowledgeRouter cascade).
- C5.1–C5.4 — circuit-breaker + dump fallback + metrics — verified (`WikidataBreakerClient`, `WikidataKbDumpRepositoryTypeOrm`, Prometheus gauges).
- DPIA + ROPA + SUBPROCESSORS — all three docs exist and are non-trivially complete (DPIA covers T1/T2/T3 with risk tables, ROPA covers TR-01…TR-07, SUBPROCESSORS covers 20 vendors with endpoint + data class + lawful basis + transfer mechanism + DPA URL).

### A says "done" → B has gap or drift

- **DPIA + ROPA marked DRAFT** awaiting DPO signature. Both files say "Awaiting DPO sign-off" at the foot. ROPA lists `dpo@musaium.app` as TBD. Plan claims a DPO will be mandated before 2026-06-01 — no evidence of contract in repo.
- **Privacy policy lists DeepSeek as active sub-processor** (`museum-web/src/lib/privacy-content.ts:179`) — "Sous-traitants : OpenAI (États-Unis), Google Cloud, **DeepSeek (Chine)**, OVH SAS, AWS, Expo/EAS." Meanwhile DPIA T1.1 + SUBPROCESSORS row 2 say DeepSeek is **disabled in EU prod**. This is a real user-facing inconsistency — either disable + remove from policy, or document the gating.
- **Privacy policy says "Aucun prestataire de paiement n'est utilisé à ce jour"** — accurate today, but C6.2 plans to add `tier` model on User entity which is a *change of processing* requiring privacy policy + ROPA update when shipped.

### A says "planned" → B partly anticipates

- **C6 soft-paywall stub** — no compteur, no `tier` column, no FE upsell screen, no admin override. Confirmed by grep (zero hits on `Stripe|payment|premium tier` in `auth/domain`). Status matches plan: roadmap shows all unchecked.
- **C7 stability** — smoke script `scripts/smoke-api.cjs` exists (`pnpm smoke:api`); `docs/CHAOS_RUNBOOKS.md` exists; release checklist exists. None of C7.1–C7.4 ticked yet — matches plan.

### B has → A doesn't mention

- `useCase/visual-similarity/` is in the chat module structure already (compare.use-case.ts + SigLIP + Replicate adapters) although C3 is planned as Phase 1 not started. This is partial scaffolding from ADR-037 + ADR-040 ; not a contradiction, but worth noting.
- `features/diagnostics/` FE folder exists; not in architecture doc.
- `useCase/retention/` folder with `prune-stale-art-keywords.ts` — supports ADR-020 retention strategy but not separately called out in architecture doc.

---

## Axis C — Regulatory (with URLs)

> **Note on cut-off.** Several rule searches returned blog-style summaries dated 2026-01/02. Where the underlying legal source is unambiguous (Regulation EU 2024/1689, French law 2023-566), I cite primary URLs. Where the rule is "current best practice but no single binding rule" (e.g. exact accessibility statement content), I cite the highest-quality available guide and flag uncertainty.

### C.1 GDPR / RGPD (Regulation EU 2016/679)

**Rule.** Art 30 ROPA, Art 28 sub-processor inventory, Art 35 DPIA when processing is "likely to result in a high risk" (cumulative WP248 criteria: large-scale + minors + innovative technology = automatic trigger). Art 5(1)(c) data minimization. Art 9 special categories (voice biometrics are Art 9 *only when used for unique identification* — pure transcription is not, per the EDPB guidance on biometric data). Art 13/14 information notice. Art 15 right of access (DSAR), Art 17 erasure, Art 20 portability. Art 44-49 international transfers — SCCs + DPF for US (Schrems II/III posture). Art 33/34 breach notification 72h.

**Applicability to Musaium.** All three criteria trigger DPIA (large-scale B2C + minors via school visits + LLM/voice innovative tech). Voice = NOT biometric since Musaium does not identify speakers (DPIA T2.1 explicitly states this). Geolocation per-message = consent under 6(1)(a). LLM history sent to US providers = Art 44-49 SCC + DPF coverage required.

**Real impl gap.**
- ROPA + DPIA both DRAFT, no DPO signature. Files at `docs/legal/ROPA.md` + `docs/legal/DPIA.md`. **P0 — launch blocker** (Art 35 explicitly requires DPIA before processing starts; DRAFT without DPO advice is not enough).
- DSAR endpoints implemented (`/auth/account/export`, `/auth/account/delete`) at `museum-backend/src/modules/auth/useCase/account/exportUserData.useCase.ts` + `deleteAccount.useCase.ts`. SLA 7d per DPIA §4.5; not verified end-to-end.
- Consent granularity = 4 scopes only (`location_to_llm, analytics, marketing, tos_privacy`) at `museum-backend/src/modules/auth/domain/consent/userConsent.entity.ts:21-26`. **No separate consent scope for "chat-to-LLM-tiers-in-US" or "voice-to-OpenAI-STT" or "image-to-OpenAI-vision"**. The `tos_privacy` bundle hides those flows behind a single click — likely fails CNIL granular-consent doctrine for cross-border AI processing. **P1.**
- Schrems II Transfer Impact Assessment (TIA) for OpenAI / Google: not in repo (SUBPROCESSORS row 1 says "Transfer impact assessment NOT YET conducted (audit G12)"). DPF is currently valid (General Court 2025-09-03 judgment upheld adequacy) but a TIA is still the EDPB-recommended safeguard. **P1.**
- Breach notification playbook (Art 33/34) — `docs/RUNBOOKS/` exists but no committed breach-SLA playbook found; DPIA §5 references mitigation but not 72h workflow. **P1.**

URL: https://artificialintelligenceact.eu/ (cross-reference) ; primary GDPR text: https://eur-lex.europa.eu/eli/reg/2016/679/oj

### C.2 EU AI Act (Regulation EU 2024/1689)

**Rule.** Risk-tiered. Cultural-assistant chatbot = **limited risk** (Art 50 transparency only) per the Article 50 + high-level summary; not high-risk (no decisions affecting access to services, employment, education enrollment, credit, etc.). Art 50 obligations enter into force **2 August 2026** — 2 months *after* Musaium's planned launch. Art 50(1): deployer must inform users they are interacting with an AI; Art 50(2): AI-generated content (text/image/audio/video) must be marked machine-readable + disclosed to user; Art 50(4): synthetic audio + deepfake disclosure. Art 5 prohibits manipulative AI exploiting minors' vulnerabilities — full force **2 February 2025** (already in force).

Sources:
- https://artificialintelligenceact.eu/article/50/
- https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50
- https://artificialintelligenceact.eu/article/5/
- https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai

**Applicability.** Musaium = interactive chatbot + generative text + synthetic audio (TTS) + generated image suggestions. All four Art 50 surfaces apply. Cultural-assistant nature keeps it out of high-risk Annex III. Art 5(1)(b) prohibition on exploiting age-vulnerability needs design awareness because minors are in the audience.

**Real impl.**
- AI Act Art 50 disclosure shipped on 3 surfaces (chat footer FE, web banner, privacy section 12 FR+EN). Goes live before the August 2026 enforcement window — comfortable.
- Synthetic audio (TTS) NOT marked machine-readable. Art 50(2) requires technical marking enabling detection. Code of Practice expected March/June 2026 will spell out the watermark mechanism — not actionable today but **track for Q3 2026**. **P2 (not blocking 2026-06-01 launch since enforcement = 2026-08-02).**
- Art 5(1)(b) — input guardrail blocks insults + off-topic; output guardrail blocks LLM-generated abusive content. No specific "minor manipulation" testing in the promptfoo regression suite (`team-promptfoo/corpus.json` is 20-feature generic). **P2.**

URL: https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content (Art 50 Code of Practice)

### C.3 CNIL — minors + voice biometric

**Rule.** France Loi 2023-566 du 7 juillet 2023 — digital majority at 15. Under 15 cannot register on social-network-like services without parental authorization (the operator must refuse). CNIL Délibération 2021-069 (reference cited in DPIA is 2021-018; the law that codified 15-year majority is the 2023-566 loi). On voice: not biometric *unless* used for speaker identification; Musaium's transcription-only path is OK.

Sources:
- https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000044183781 (Délibération 2021-069 3 juin 2021)
- https://www.economie.gouv.fr/daj/lettre-de-la-daj-la-loi-ndeg2023-566-du-7-juillet-2023-cree-une-majorite-numerique-fixee-15-ans
- https://www.cnil.fr/fr/recommandation-1-encadrer-la-capacite-dagir-des-mineurs-en-ligne

**Applicability.** Musaium = chat service with B2C + scolaire path; clearly under the 2023-566 law if scolaire visits are in scope.

**Real impl.**
- Age-gate at 15 implemented: `museum-backend/src/modules/auth/useCase/registration/register.useCase.ts:108-121`. CNIL reference cited in JSDoc.
- Parental authorization flow = V1 statique (DPIA T1.3 says "screen statique « contacter l'établissement »"). V1.1 will be email-attestation. **P1** — operating the scolaire path without a real parental-consent mechanism is risky once an institution-partner signs.
- DPIA cites "CNIL Délibération 2021-018" — this looks like a typo: the actual ref is 2021-069 of 2021-06-03 *and* the binding law is 2023-566. Fix wording before DPO sign-off. **P2 (doc fix).**
- Voice: not biometric in current code path (no speaker identification, buffer discarded after STT). DPIA §T2.1 affirms this. OK.

### C.4 Digital Services Act (Regulation EU 2022/2065)

**Rule.** DSA applies to all "intermediary services" (mere conduit, caching, hosting), with stricter obligations on "online platforms" (allow users to publish content to the public) and VLOPs (>45M MAU). Musaium hosts user reviews (`features/review/`) which are public — likely qualifies as "online platform". Basic obligations: transparency reports (Art 24), notice-and-action (Art 16), out-of-court dispute settlement (Art 21), point of contact (Art 11), terms with restriction info (Art 14). Micro/small enterprises exempted from some platform-specific obligations (Art 19) if they are not VLOPs.

Source: https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package

**Applicability.** Musaium = small/micro provider until B2B revenue ramps. Likely qualifies as "online platform" because of public reviews. Eligible for SME exemption (Art 19) from platform-specific obligations *but* must still publish a transparency report annually and notify Commission of MAU.

**Real impl.**
- `features/review/` ships UX + moderation pipeline. `useCase/review` BE in `museum-backend/src/modules/review/`. ROPA TR-07 covers it.
- **No DSA point-of-contact published.** Searched `docs/`, `docs/legal/`, web privacy + support pages — found "complaints" pointing to CNIL (GDPR) but no single Art 11 contact for "illegal content notices". **P1.**
- **No transparency report.** Not blocking pre-launch but due within 12m of first activity. **P2.**
- **No notice-and-action endpoint** for user-flagged illegal content beyond the generic support form. Pre-flag guardrail-based check exists for reviews (ROPA TR-07 "guardrail-based pre-flag pour les contenus suspects") but Art 16 demands a *user-facing* notice mechanism. **P1.**

### C.5 European Accessibility Act (Directive (EU) 2019/882) — EAA

**Rule.** Enforceable since **28 June 2025**. Mobile apps + websites delivering consumer e-services (purchases, communications, transport, banking, media) must conform to EN 301 549 which embeds **WCAG 2.1 Level AA**. Member states transpose into national law (France: ordonnance 2023-859); penalties include market restriction. Required artefacts:
1. Accessibility statement on each public service (website + app).
2. EN 301 549 conformance audit (or equivalent self-assessment) on file.
3. User-feedback channel for accessibility issues.
4. Plan for fixing known gaps.

Sources:
- https://www.levelaccess.com/blog/eu-accessibility-requirements-and-eaa-compliance/
- https://www.accessibility.works/blog/eaa-en301549-compliance-european-accessibility-act/
- https://eye-able.com/compliance/european-accessibility-act-eaa
- https://eur-lex.europa.eu/eli/dir/2019/882/oj (Directive 2019/882 primary text)

**Applicability.** Musaium = consumer mobile app + consumer landing site + EU market. **Squarely in scope.** Freemium nature does not exempt — EAA covers the *service*, not the price model. SME exemption applies only to micro-enterprises (<10 employees AND <€2M turnover) AND only for service providers (not products); Musaium qualifies as a micro-enterprise today but the EAA SME exemption is narrower than e.g. DSA's — it exempts microenterprises from *the directive* only for services, not from the underlying national law for products. Conservatively assume full coverage applies.

**Real impl gap.**
- `museum-web/src/app/[locale]/` has **no `accessibility-statement/` route**. Grep across `docs/` + `museum-web/src` for `accessibility statement`, `déclaration d'accessibilité`, `EN 301 549`, `RGAA` returned zero matches. **P0 — launch blocker** since EAA was enforceable nearly a year ago and a consumer-facing app without an accessibility statement is *non-conformant on the document layer alone*.
- WCAG 2.1 AA evidence: `@axe-core/playwright` is in `museum-web/package.json` devDeps, one a11y test file exists in FE (`museum-frontend/__tests__/a11y/accessibility-audit.test.tsx`), 135 hits on `AccessibilityInfo|accessibilityHint|accessibilityRole` in FE features. This is partial — *no audit report committed*, no Lighthouse-a11y CI gate I could find in `.github/workflows/ci-cd-web.yml` (description only mentions Lighthouse perf), no equivalent for mobile. **P0 for launch month — at minimum publish a self-assessment + statement.**
- User feedback channel for a11y issues: support form exists but no a11y-specific topic. **P2.**

### C.6 App store rules 2026

**Rule.** Apple App Store Review Guidelines (Nov 2025 update — guideline 5.1.2(i)) require: clearly disclose when personal data is shared with third-party AI + obtain explicit user permission *before first transmission*. Apple "age controls" tightened on data sharing disclosure; minor-data rules apply (limit ads, no behavioral tracking under 13). Google Play 2026: AI-generated content policy requires clear disclosure to user; Age Signals API mandatory from 2026-01-01; new app safety policy effective 30 days after 2026-04-15 announcement (i.e. mid-May 2026).

Sources:
- https://developer.apple.com/app-store/review/guidelines/
- https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai/
- https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p
- https://support.google.com/googleplay/android-developer/answer/16926792 (Google Play 2026-04-15 announcement)
- https://support.google.com/googleplay/android-developer/answer/14094294 (Google Play AI content policy)

**Applicability.** Both stores apply: Musaium ships iOS via EAS + Apple App Store + Google Play.

**Real impl.**
- AI Act Art 50 disclosure footer at `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx` covers Google Play's "clear disclosure" requirement.
- Apple's *consent-before-first-transmission* requirement (guideline 5.1.2(i)) is partially met by the registration-time `tos_privacy` consent — but Apple expects a *specific, granular* consent for third-party AI data sharing, distinct from a generic ToS. Same gap as C.1 consent granularity. **P0 for App Store submission review** — a chat message to OpenAI before a granular AI-share consent will likely be flagged.
- Age controls: registration age-gate at 15 covers CNIL but Apple's "13+" minor-data rules apply globally. The data-safety section of Google Play + privacy nutrition label on Apple need updating with the latest sub-processor list. `docs/GOOGLE_PLAY_DATA_SAFETY.md` exists — not verified content. **P1.**

### C.7 Payment (PSD2 / PSD3)

**Rule.** PSD2 SCA applies to EEA payments; auto-renew subscriptions need SCA on first transaction only. PSD3 + PSR provisional agreement Dec 2025; not in force until ~2027. App-store IAP handles SCA on Apple/Google side. Apple EU "Core Technology Fee" replaced Nov 2025 with multi-tier 2-13% structure. EU pricing transparency: total price visible *before* purchase (Omnibus Directive).

Sources:
- https://www.iaphub.com/blog/sca-psd2/
- https://blog.funnelfox.com/apple-app-store-fees-2026-eu-dma/
- https://www.gpayments.com/blog/article/3d-secure-and-psd2-strong-customer-authentication-a-guide-for-european-and-uk-psps/

**Applicability.** Musaium V1 has **no payment integration** (verified — zero hits on `Stripe|payment|checkout` in code). C6 is a stub only. PSD2/PSD3 not in scope until Stripe / IAP shipped.

**Real impl.**
- N/A for 2026-06-01 launch. When C6 → C-Stripe ships, EU pricing transparency + SCA + cancellation flow + cooling-off (14 days for distance contracts per CRD) apply. **P2 (track for post-launch).**

### C.8 Open-source licensing

**Rule.** GPL/AGPL deps that ship in a proprietary distribution can trigger copyleft on the whole distribution. LGPL deps are OK if dynamically linked. Common safe licenses: MIT, ISC, Apache-2.0, BSD-2/3.

**Scan result.** Grep across the 3 `node_modules/`:
- `museum-backend/node_modules/eslint-plugin-sonarjs` — LGPL-3.0-only. **Dev dependency only** (`"eslint-plugin-sonarjs": "^4.0.3"` in devDependencies). LGPL dev dep does not contaminate prod build. OK.
- `museum-frontend/node_modules/node-forge` — dual `(BSD-3-Clause OR GPL-2.0)`. Dual-licensed → consumer picks BSD-3. **Transitive** (not in FE root package.json). OK.
- No AGPL deps detected.

**Real impl.** No copyleft contamination risk for V1 launch. Add license audit to CI (e.g. `license-checker --excludePackages '...' --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;CC0-1.0;CC-BY-4.0;Unlicense'`) to lock this in post-launch. **P2.**

---

## Diff B vs C (real ≠ regulatory)

P0 (launch blocker for 2026-06-01):
1. **DPIA + ROPA DRAFT, no DPO signature.** Art 35 GDPR demands DPIA completed *before* processing begins; "DRAFT awaiting DPO" is not compliant if processing starts 2026-06-01. *Severity: P0.*
2. **No EAA accessibility statement** on `museum-web` or `museum-frontend`. EAA enforceable since 2025-06-28. Statement + minimal self-assessment per EN 301 549 must be published. *Severity: P0.*
3. **Privacy policy lists DeepSeek as active sub-processor** while SUBPROCESSORS + DPIA say it's disabled in EU prod. Either remove from policy or expose a real toggle + non-EU-residency gate. User-facing inconsistency = supervisory authority risk. *Severity: P0 (user-facing).*
4. **Consent granularity** — no separate scope for AI chat / voice / image processing. Bundled in `tos_privacy`. Apple App Store 5.1.2(i) + CNIL granular-consent both want individual opt-ins. *Severity: P0 for store review; P1 for CNIL.*

P1 (must fix Q3 2026):
5. Schrems II Transfer Impact Assessment (TIA) for OpenAI / Google. SUBPROCESSORS row 1 already flags G12 open. Especially important after Sept 2025 General Court ruling (DPF held, but Schrems III incoming).
6. DSA Art 11 point-of-contact + Art 16 notice-and-action mechanism for reviews.
7. CNIL parental-consent V1 is statique ("contacter l'établissement") — not enough once an institution-partner ships. Need V1.1 email-attestation flow.
8. Breach notification playbook (Art 33/34) — Art 33 deadline is 72h, runbook should be committed.
9. Apple privacy nutrition label + Google Play Data Safety form must be re-verified against the current 20-vendor SUBPROCESSORS ledger and updated before store submission.
10. T1.7 deploy-ops follow-ups in `ROADMAP_TEAM.md`: audit-chain alerting email fallback, `GUARDRAILS_V2_CANDIDATE=off` confirmation, GHCR_TOKEN read:packages scope, INSULT_KEYWORDS FR trim, RedisNonceStore wire, `@xmldom/xmldom` override bump.

P2 (monitor):
11. AI Act Art 50(2) synthetic-audio watermarking when Code of Practice lands (June 2026).
12. Tavily / Unsplash / Brave / Apple DPA URL legal verification.
13. License-checker in CI to lock the OSS posture.
14. DPIA wording fix: "CNIL Délibération 2021-018" → check actual reference (Loi 2023-566 + Délibération 2021-069).
15. DSA transparency report due ~12m after launch.

---

## Launch blockers for 2026-06-01

**Proven by code/docs + regulation. 4 hard blockers:**

| # | Blocker | Proof | Severity |
|---|---|---|---|
| 1 | DPIA + ROPA unsigned | `docs/legal/DPIA.md:205` ("END DPIA v1.0 DRAFT — Awaiting DPO sign-off") + `docs/legal/ROPA.md:168` | P0 GDPR Art 35 |
| 2 | No EAA accessibility statement | grep across `docs/` + `museum-web/src` = 0 matches for `accessibility statement`, `déclaration d'accessibilité`, `EN 301 549`, `RGAA` | P0 EAA |
| 3 | DeepSeek in user-facing privacy as active sub-processor | `museum-web/src/lib/privacy-content.ts:179` lists "DeepSeek (Chine)" while `docs/compliance/SUBPROCESSORS.md:33` + `docs/legal/DPIA.md:50` say disabled EU | P0 GDPR Art 13 (information accuracy) |
| 4 | Consent granularity insufficient for store review + CNIL | `museum-backend/src/modules/auth/domain/consent/userConsent.entity.ts:21-26` lists 4 scopes, none for AI/voice/image to third country | P0 App Store 5.1.2(i) + P1 CNIL |

**Soft blockers (not strictly illegal but politically risky):**
- No DSA point-of-contact or notice-and-action UX.
- Parental-consent flow is statique — fine for B2C visiteur, fragile once scolaire pilots ship.

---

## Recommendations (Q2 ranked, max-leverage first)

1. **Engage a DPO this week.** External DPO mandate (~€500-1500 one-shot for V1 sign-off). Without signature on DPIA/ROPA, launch is technically non-conformant. Add `dpo@musaium.app` mailbox alias + 1 mailto in privacy policy. *Effort: 1 week clock time, 2 hours dev.*

2. **Ship EAA accessibility statement + EN 301 549 self-assessment** before 2026-06-01.
   - Add `museum-web/src/app/[locale]/accessibility/page.tsx` (FR + EN) modeled on the existing privacy page.
   - Run `axe-core/playwright` audit + `Lighthouse a11y` on web ; for mobile run `axe-core-android` Maestro flow.
   - Publish self-assessment with 3 columns: criterion / status / mitigation.
   - Add user-feedback channel: pre-fill the support form with topic "accessibility".
   *Effort: 2-3 days.*

3. **Cleanup user-facing privacy policy** — remove DeepSeek from sub-processor list (or document the "EU residents are routed to OpenAI/Google by default" gating as user-visible). Also fix the retention claim "audio non stocké" wording vs `ChatMessage.audioUrl` persistence of OUTPUT audio (input audio is not stored — make this explicit). *Effort: 1 hour.*

4. **Granular consent UX (P0 for Apple).** Split `tos_privacy` into:
   - `tos` (contract)
   - `privacy_policy` (info notice ack)
   - `ai_chat_to_third_country` (AI processing in US — Art 49 derogation + Art 13(1)(f) info)
   - `voice_processing` (STT)
   - `image_processing` (vision)
   
   Add to `CONSENT_SCOPES` const + onboarding screen + revoke screen + middleware on each pipeline that verifies the right scope is granted. Migrate existing users via `tos_privacy → tos + privacy_policy + ai_chat_to_third_country` backfill (default-grant existing accounts on first session post-update with a 1-shot consent re-prompt). *Effort: 3-5 days, BE + FE.*

5. **DSA bare-minimum compliance.**
   - Add `museum-web/src/app/[locale]/legal/contact/page.tsx` with Art 11 point-of-contact email.
   - Add "Report illegal content" link from each public review tile → support form with topic preset "illegal_content_review". 
   - Update terms to include Art 14 restriction info.
   *Effort: 1 day.*

6. **TIA for OpenAI + Google** (1-pager each: data class, country, government access risk, supplementary safeguards). Pin to `docs/legal/TIA_*.md`. *Effort: 1 day + DPO review.*

7. **CNIL fix-ups in DPIA** — 2021-018 → 2021-069 + Loi 2023-566 reference; mention WP248 explicit cumulative criteria. *Effort: 30 min.*

8. **Lock OSS license posture** via `license-checker --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;CC0-1.0;Unlicense'` in CI for all three apps. *Effort: 2 hours.*

9. **Park AI Act Art 50(2) audio-watermark** as Q3 2026 tracked item — wait for Code of Practice (June 2026).

10. **Privacy policy v1.1 ROPA update** when C6 paywall stub ships — add `analytics-funnel` ROPA entry + sub-processor for email-capture (Brevo list).

---

## Citations (the 1 URL the user must read this week)

**Most important for action this week:** https://eur-lex.europa.eu/eli/dir/2019/882/oj (European Accessibility Act primary text) — particularly Annex I §I-V on accessibility requirements applicable to consumer services. Followed by https://www.cnil.fr/fr/recommandation-1-encadrer-la-capacite-dagir-des-mineurs-en-ligne (CNIL minors).

Other primary sources cited above:
- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- EU AI Act 2024/1689: https://artificialintelligenceact.eu/article/50/ and https://artificialintelligenceact.eu/article/5/
- Loi 2023-566: https://www.economie.gouv.fr/daj/lettre-de-la-daj-la-loi-ndeg2023-566-du-7-juillet-2023-cree-une-majorite-numerique-fixee-15-ans
- DSA: https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package
- Apple 5.1.2(i): https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai/
- Google Play 2026: https://support.google.com/googleplay/android-developer/answer/16926792

---

**END 05 — Architecture: planned / real / regulatory.**
