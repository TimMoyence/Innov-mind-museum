# AI Safety — Musaium guardrail doctrine

> **Status:** Live document — extracted at Phase 0 fold-in of the perennial 10-year design (2026-05-12).
> **Steward:** founder/tech lead (solo). When the first B2B LOI lands, hiring trigger for a security/SRE FTE per perennial design RP1 is **declined by the user** in favour of solo dev + OSS tooling + WebSearch loop.
> **Last review:** 2026-05-31 (claims re-vérifiés contre le code : tous les chemins L1-L5 + audit + compliance résolvent ; corrigé `VoiceSessionIntro.tsx` → `VoiceSessionIntroSheetContent.tsx` et le wiring Presidio `chat-module.ts:441` → `:471`). Antérieur : 2026-05-20 (L5 judge row + Presidio wiring corrected against code).
> **Related ADRs:** ADR-015 (LLM judge V2), ADR-030 (judge budget cap), ADR-038 (anti-hallucination + citations + WebSearch), ADR-047 (LLM-Guard circuit breaker fail-CLOSED), ADR-048 (`GuardrailProvider` strategy interface), ADR-049 (LLM security CI gates).
> **Related docs:** `docs/AI_VOICE.md`, `docs/GDPR_ART22_SCOPE.md`, `docs/legal/DPIA.md`, `docs/legal/ROPA.md`, `docs/compliance/DATA_FLOW_MAP.md`, `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`, `docs/compliance/FAIRNESS_METRICS_PLAN.md`, `docs/compliance/art5-audit.md`, `docs/compliance/SUBPROCESSORS.md`, `docs/RUNBOOKS/guardrail-incidents.md`, `docs/RUNBOOKS/audit-chain-forensics.md`, `docs/OPS_INCIDENT_LLM_GUARD.md`, `docs/operations/CAPACITY_PLAN_100K.md`.
> **Source design:** `.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/{spec,design}.md`.

---

## 1. Purpose of this doc

Musaium's chat pipeline (text and voice) processes free-form user input, emits AI-generated content to end-users, and — in some B2B museum scenarios — interacts with children. This document codifies the **layered defence doctrine**, the **fail-CLOSED contract**, the **audit posture**, the **compliance touch-points**, and the **escalation paths**.

What this document is NOT:

- An implementation guide. Implementation lives in code + per-feature ADRs.
- A legal opinion. Legal counsel is engaged at the first B2B LOI signing (perennial design D2).
- A complete threat model. A future dedicated threat-model doc (`THREAT_MODEL.md`, not yet created under `docs/`) may extract one when warranted.

## 2. Layered defence

The guardrail subsystem is **five independent layers**, applied in order, around the LLM call. A failure in one layer does NOT bypass the others.

| # | Layer | Location | When | Failure mode |
|---|---|---|---|---|
| L1 | **Keyword pre-filter** (`art-topic-guardrail.ts`) | input, before any other layer | every prompt | deterministic — zero upstream dependency |
| L2 | **`sanitizePromptInput()`** Unicode normalisation + zero-width strip + length cap (`@shared/validation/input.ts`) | input, on every user-controlled field (locale, location, freetext) | every prompt | deterministic |
| L3 | **Structural prompt isolation** — system instructions + section prompts BEFORE user content, with `[END OF SYSTEM INSTRUCTIONS]` boundary marker | LangChain message-array assembly (`llm-prompt-builder.ts`) | every LLM call | architecturally enforced |
| L4 | **LLM-Guard sidecar** (`LLMGuardAdapter` implementing the `GuardrailProvider` port, ADR-048) | input + output of every chat turn | every chat turn | **fail-CLOSED** when timeout / network / breaker OPEN / semaphore overflow (ADR-047) |
| L5 | **LLM judge** (`llm-judge-guardrail.ts`, ADR-015) | input — selectively, only on uncertain V1 allows (`message.length > env.guardrails.judgeMinMessageLength`) | uncertain inputs the keyword pre-filter allowed | **fail-OPEN** to the keyword decision (timeout / schema violation / model throw / budget exhausted → `null` → `{ decision: 'review' }`) + daily budget cap (ADR-030) |

The keyword guardrail (L1) is the **first defence** and remains deterministic. The LLM-Guard sidecar (L4) is enforced **on top**, not as a replacement. **Removing one layer does not equal removing the defence** — but no single layer is sufficient. L1 is fast and deterministic but low-recall on novel attacks; L4 is high-recall on novel attacks but network-dependent; L5 is input-side and judges the semantic content of inputs the keyword filter left uncertain. The combination is the doctrine.

## 3. Fail-CLOSED contract (non-negotiable)

When any `GuardrailProvider` fails (timeout, network error, malformed response, circuit breaker OPEN, inflight semaphore overflow), the system returns:

```ts
{ version: 'v1', allow: false, reason: 'service_unavailable' }
```

The user sees a localised "service temporarily unavailable" message (FR/EN ship; other locales fall back to EN until a future ADR extends the i18n surface). This is the `service_unavailable` mapped reason added at ADR-047 — distinct from `unsafe_output` so the UI no longer says "your content was flagged" on infrastructure failures.

**Rationale.** In pre-launch V1 and indefinitely thereafter (per `feedback_no_feature_flags_prelaunch`), there is **no `*_FAIL_OPEN`, no `*_BREAKER_ENABLED`, no kill-switch** for the guardrail or the fail-CLOSED policy. Tuning is via thresholds (`LLM_GUARD_CB_FAILURE_THRESHOLD`, `LLM_GUARD_MAX_INFLIGHT`, `LLM_GUARD_QUEUE_MAX`, etc.) — those are operational knobs of an always-on behaviour, not feature flags.

The L1 keyword guardrail does **NOT replace** L4 during a CB-OPEN window. When L4 is degraded, the user gets a refusal; we do not silently fall back to keyword-only inspection. The graceful-degradation hierarchy proposed in the perennial design (Phase 2.D) introduces explicit levels (L0=normal / L1=keyword-strict-only / etc.), but each level transition is a **conscious policy decision** invoked via thresholds, never a runtime accident.

## 4. Audit posture

Every guardrail-relevant decision is observable via three channels:

- **Prometheus metrics** — point-in-time gauges + cumulative counters, source of truth: `museum-backend/src/shared/observability/prometheus-metrics.ts` (`musaium_llm_guard_*` series). Alert rules: `infra/grafana/alerting/llm-guard-bias.yml`.
- **Structured logs** — `logger.info` / `logger.warn` on every decision event (`llm_guard_circuit_breaker_{skip,open,half_open,close}`, `advanced_guardrail_block`, `llm_guard_fail_closed`).
- **Audit log** — append-only table `audit_log`, hash-chained (`museum-backend/src/shared/audit/audit-chain.ts`), 13-month retention with post-retention IP anonymisation (`audit-ip-anonymizer.job.ts`), authoritative for GDPR Art. 30 and AI Act Art. 12. Forensics CLI: `museum-backend/src/shared/audit/audit-chain-cli-core.ts`. Forensic procedure: `docs/RUNBOOKS/audit-chain-forensics.md`. Breach event types: `museum-backend/src/shared/audit/breach-event-types.ts` (GDPR Art. 33, CNIL 72h).

**Audit kinds covered today** (per ADR-047 + Phase 0):

- `AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN` — emitted on every breaker `CLOSED → OPEN` transition. Payload: `failureCount`, `windowMs`, `openedAt`, `policyVersion: 'default-v0'` (Phase 0 anchor for Phase 2 per-tenant policy versions).
- `AUDIT_GUARDRAIL_BLOCKED_INPUT` / `AUDIT_GUARDRAIL_BLOCKED_OUTPUT` — emitted on every block (added by ADR-047 fast-follow).

### Current limitations (acknowledged, scheduled for Phase 1)

- **No per-decision row.** Only state transitions and blocks are audited; an allowed decision is observable in metrics/logs but not in the audit table. A future GDPR Art. 22 query for "show me the decision history for user X over the last 30 days" requires Phase 1 work.
- **No per-decision shadow-run audit.** Phase 1 introduces the shadow-mode runner (per perennial design); each shadow decision will write a `policy_shadow_decisions` row alongside the primary decision.
- **No PII redaction primitive shared across the codebase.** Audit log already excludes raw payloads (only SHA-256 fingerprints + ≤64-char redacted snippet via `guardrail-audit-payload.ts`); Phase 1 introduces a shared `redactForAudit(text)` helper for reproducible-without-storage forensics.

## 5. Compliance touch-points

### GDPR

- **Art. 5(1)(c) data minimisation** — guardrail audit stores no raw prompts. Hash-only when reproducibility is needed (see §4).
- **Art. 22 right not to be subject to automated decision-making** — **Musaium does NOT engage Art. 22 directly** (chat refusals are advisory, not legally significant). See `docs/GDPR_ART22_SCOPE.md` for the formal scope analysis + the SCHUFA-style escalation triggers that would change this conclusion. Phase 1 will ship the `GET /api/chat/messages/:id/explanation` endpoint preemptively as best-practice (covers AI Act Art. 14 spirit + future-proofs against SCHUFA escalation).
- **Art. 30 records of processing** — covered by `docs/legal/ROPA.md` + the hash-chained audit log. Subprocessors documented in `docs/compliance/SUBPROCESSORS.md`. Data flows in `docs/compliance/DATA_FLOW_MAP.md`.
- **Art. 33 breach notification** — `audit.service.ts` + `breach-event-types.ts` compute the CNIL 72h deadline + emit the `BreachAuditEvent`. Runbook: `docs/RUNBOOKS/audit-chain-forensics.md`.
- **DPIA** — `docs/legal/DPIA.md`.

### EU AI Act (phased; Art. 5 prohibitions effective Feb 2025, Art. 50 transparency Aug 2026, high-risk Annex III Aug 2027)

- **Art. 5 prohibitions** — Musaium does not perform subliminal manipulation, social scoring, biometric categorisation, emotion recognition in workplace/education contexts, or exploitation of vulnerabilities. Formal audit: `docs/compliance/art5-audit.md`.
- **Art. 50 transparency** — Phase 0 ships **audio disclosure at voice session start** (`features/chat/ui/VoiceSessionIntroSheetContent.tsx`) + visible AI badge on the chat header (`features/chat/ui/ChatHeader.tsx`) + `docs/legal/AI_DISCLOSURE.md`. **The TTS "alloy" voice is sufficiently natural that a visual badge alone is insufficient under EU Commission voice-mode guidelines** — explicit audio disclosure is the compliance gate.
- **Art. 9 risk management (high-risk only)** — Musaium is **limited-risk B2C**, **limited-risk by default B2B**, and **escalates to high-risk Annex III §3 only if a museum customer integrates Musaium into formal student evaluation** (which is **out of scope** of the standard guided-visit licence; if a contract requires it, legal review precedes signing per D2). See `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md` for article-by-article status.
- **Art. 12 record-keeping (if high-risk)** — already covered by the hash-chained audit log (§4). 13-month retention satisfies the typical 6-month statutory floor + extension for litigation hold.
- **Art. 14 human oversight (if high-risk)** — the "Signaler" button in chat (`features/chat/ui/ChatMessageBubble.tsx`) is one form of recourse; if a future workflow involves an admin acting on guardrail flags, **`docs/GDPR_ART22_SCOPE.md` (SCHUFA section) MUST be re-read** before deployment.
- **Art. 50 + Recital 142** voice-mode disclosure — `docs/legal/AI_DISCLOSURE.md`.

### OWASP LLM Top 10 (2025 update)

Coverage per `.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-owasp-llm-top10.md`:

| Risk | Status | Notes |
|---|---|---|
| LLM01 prompt injection | PARTIAL | L1 + L3 + L4 cover direct; Phase 1.5 Garak/promptfoo CI (ADR-049) extends to paraphrase / translation / role-play |
| LLM02 PII leakage | PARTIAL → landed-behind-flag | `RegexPiiSanitizer` covers email + phone; `MicrosoftPresidioAdapter` named-entity NER wired behind `PRESIDIO_ENABLED` (C9.8, 2026-05-17) |
| LLM03 supply-chain | PARTIAL | image digest pinning + Renovate; Phase 3 chaos drill + DR runbook |
| LLM04 data + model poisoning | NOT-APPLICABLE | no user-controllable training |
| LLM05 improper output handling | MITIGATED | React Native `<Text>` zero HTML injection; TypeORM zero SQLi |
| LLM06 excessive agency | MITIGATED | no agentic / tool-calling; pure text generator |
| LLM07 system prompt exfiltration | PARTIAL → Phase 1 | ADR-049 Garak + promptfoo CI; corpus 85 adversarial prompts × 8 locales |
| LLM08 vector + embedding | PARTIAL → DONE-ish (2026-05-13) | `museum_id` scope landed on `artwork_embeddings` + `findNearest()` (migration `1778622760826`). V1 single-tenant ships unscoped on purpose (warn-logged `artwork_embeddings_find_nearest_unscoped`) — flip to mandatory before first B2B onboarding |
| LLM09 misinformation | PARTIAL → DONE-ish | ADR-038 anti-hallucination + Wikidata KB + WebSearch fallback + Spotlighting + URL HEAD probe (V1.1) |
| LLM10 unbounded consumption | PARTIAL → Phase 1 | LLM judge daily budget cap (ADR-030); Redis aggregation for multi-instance is Phase 1 work |

## 6. Voice-specific safety (`docs/AI_VOICE.md`)

- STT (`gpt-4o-mini-transcribe`) — transcript flows through L1-L5 identically to text.
- TTS (`gpt-4o-mini-tts`, voice `alloy`) — output audio is generated from text that has passed the output-side guardrail (L4 output scan); the input transcript was already screened by L1-L5 input layers. Audio itself is not re-scanned; an audio classifier sits on a Phase 2 re-evaluation if telemetry surfaces a gap.
- **Art. 50 audio disclosure** in voice mode — explicit greeting at session start (`features/chat/ui/VoiceSessionIntroSheetContent.tsx` + 8-locale i18n in `museum-frontend/shared/locales/*/translation.json:voice.disclosure`). Visual badge in `ChatHeader` supplements but does not replace the audio.
- Realtime WebRTC (ADR-042, currently deferred) MUST go through L1-L5 when (if) it ships. A parallel codepath that bypasses guardrails is the perennial design's identified risk #8 (asymmetry). Phase 3+ work.

## 7. Provider strategy + supply chain

Per ADR-048, providers implement the `GuardrailProvider` port (`museum-backend/src/modules/chat/domain/ports/guardrail-provider.port.ts`). Default provider: `LLMGuardAdapter` wrapping `laiyer-ai/llm-guard` Python sidecar (active when `GUARDRAILS_V2_LLM_GUARD_URL` set). `MicrosoftPresidioAdapter` is now wired behind a flag (C9.8, 2026-05-17): when `PRESIDIO_ENABLED=true` + `PRESIDIO_BASE_URL` set, it takes over as the V2 provider for full LLM02 NER coverage (`chat-module.ts:471`). `LlamaPromptGuardAdapter` is scaffolded but not yet wired (ADR-051).

ADR-015 flagged the upstream as "hobbyist-grade". The `compliance-research-guardrail-alternatives.md` benchmark (May 2026) measured 0.22 recall on the adversarial arXiv 2502.15427 corpus for the incumbent prompt-injection scanner, versus 0.733 for Llama Guard 2 and 0.916 for Granite Guardian. **Provider swap is partially landed:** the Presidio PII adapter is shipped behind `PRESIDIO_ENABLED` (C9.8) and the Llama Prompt Guard adapter is scaffolded but unwired. Full promotion (ADR-051) carries mandatory shadow mode (≥7 days of parallel run, decisions logged, compared, gated on `version` + `metrics()` snapshots) before promotion. Top candidate: Llama Prompt Guard 2 86M (Meta, MIT, 97.5% recall @ 1% FPR, CPU-viable 150-400 ms, 8 languages incl. FR) paired with Microsoft Presidio for PII.

Supply-chain DR — image digest pinning + quarterly chaos drill (Phase 3, perennial design §11). Until then, fast manual rollback path documented in `docs/RUNBOOKS/V1_FALLBACKS.md`.

## 8. Bias & fairness monitoring

Currently unmonitored. Phase 1 ships per `docs/compliance/FAIRNESS_METRICS_PLAN.md`:

- `musaium_guardrail_decisions_total{locale, layer, decision}` counter
- `musaium_guardrail_category_blocks_total{locale, category}` counter
- `musaium_guardrail_block_rate_per_locale{locale}` gauge (recording rule)

**Critical methodological note:** baseline = `avg(block_rate_all_locales)` (equal-weighted per-locale mean), **NOT** the global `total_blocks / total_requests` (which is contaminated when a single locale dominates blocks). Alert thresholds: 2× warning, 3× critical, 5× page-out. Alert rules in `infra/grafana/alerting/llm-guard-bias.yml` (BiasLocalBlockRateDrift).

Rationale: a guardrail layer that systematically blocks more prompts in Arabic than French is either a calibration bug or a content reality. Without monitoring, we cannot distinguish, and a press piece "Musaium censors language X speakers" lands without evidence to refute. Per AI Act Art. 10 (data governance for high-risk), bias monitoring becomes a hard requirement if a B2B contract classifies Musaium as high-risk.

## 9. Capacity + scaling (`docs/operations/CAPACITY_PLAN_100K.md`)

The guardrail stack is provisioned for:

- **V1 launch** — 1 VPS, 2 LLM-Guard replicas, 8 inflight per replica, ≤ 12 scans/sec peak.
- **10k DAU** — same VPS + Redis cluster for budget aggregation (Phase 1).
- **50k DAU** — pgbouncer transaction-mode tuning + Postgres read replica + 4 sidecar replicas.
- **100k DAU** — multi-region (EU + US), CDN, 8 sidecar replicas per region, per-tenant rate limiter active (Phase 3).

Bottlenecks: sidecar CPU on single-VPS; Postgres write amplification on audit log volume; LLM judge cost amplification on multi-instance counter (until Phase 1 Redis aggregation lands per ADR-030 §Phase 2).

## 10. Escalation & process

- **Owner:** founder/tech lead (current, solo). Hiring trigger at first B2B LOI **declined** by user (2026-05-12); replaced by solo dev + OSS tooling + WebSearch loop. Continue monitoring this decision at every B2B contract milestone.
- **Review gates** — CODEOWNERS rule (`.github/CODEOWNERS`) on `guardrail-reason-mapping.ts`, `art-topic-guardrail.ts`, `env.guardrails.*` thresholds, `docs/AI_SAFETY.md`, `docs/GDPR_ART22_SCOPE.md`, `docs/legal/`, `docs/compliance/`. Self-review enforced today; future FTE addition is one-line update.
- **Pull-request checklist** — `.github/PULL_REQUEST_TEMPLATE.md` includes the mandatory AI-safety checklist; PRs touching guardrails MUST tick every box.
- **CI gates** — ~~`llm-security-garak.yml` — supprimé 2026-05-17 (ADR-049 amendment, coût ~$120/mois, déféré V2.1)~~ + `.github/workflows/llm-security-promptfoo.yml` (system-prompt-leakage regression) + `.github/workflows/llm-promptfoo-smoke.yml` (daily art recall smoke). ADR-049 codifies.
- **Postmortem** — every user-visible false positive AND every detected false negative triggers a postmortem. Template: `docs/operations/POSTMORTEM_TEMPLATE.md`. Cadence + linkage to audit log per `docs/RUNBOOKS/guardrail-incidents.md`.
- **Pentest** — annual cadence from first B2B GA. Scope template: `docs/operations/PENTEST_SCOPE.md`.

## 11. Where to go from here

| Action | Required artefact |
|---|---|
| Modify any of L1-L5 | ADR + this doc updated |
| Change a threshold in `env.guardrails.*` | 1-line PR; this doc updated only if doctrine impact |
| Add a provider | ADR (e.g. ADR-051 for first new provider) + shadow mode procedure (Phase 1) |
| Add a new layer (e.g. content classifier between L4 and L5) | ADR + new section in this doc |
| Legal / compliance question | Engage counsel (D2 trigger) |
| Reclassify B2B as high-risk Annex III | Trigger conformity assessment + ship Phase 2 audit/explanation infrastructure ahead of contract signing |

This document is versioned alongside the code. Edits flow through PR review with CODEOWNERS approval. Each significant amendment (new layer, new doctrine, new provider) becomes its own ADR.
