# R4 — AI Safety / Guardrails Stack Audit (2026-05-12)

Research agent **R4** auditing Musaium's 3-layer guardrail stack against the 2026 AI safety landscape. Scope : LLM Guard sidecar, alternatives (NeMo Guardrails, Llama Guard 3/4, LlamaFirewall, Lakera, Rebuff, Granite Guardian, Constitutional Classifiers), OWASP LLM Top 10 2025, adversarial testing tools (Promptfoo / Garak / Giskard), defense-in-depth patterns, AI Act Art. 50.

Honesty UFR-013 applied throughout : factual claims are sourced ; "I expect" vs "code says" distinguished ; "Llama Guard 4" claim corrected (no such product exists — see §3).

---

## TL;DR

1. **Musaium's 3-layer stack (input keyword filter → LLM Guard sidecar fail-CLOSED with breaker+semaphore → output keyword filter, plus Promptfoo+Garak weekly CI per ADR-049, plus AI Act Art. 50 disclosure)** is **architecturally sound and ahead of most 2026 production deployments**. The sidecar+breaker+inflight-semaphore composition matches industry-leading reliability patterns (fail-CLOSED, no fan-out, no fail-open vulnerability window).

2. **LLM Guard (Protect AI, v0.3.16 today, MIT licence, 2.5M+ downloads)** is the right OSS choice for self-hosted deployments. Alternatives are either commercial gated (Lakera post-Check-Point), heavier (NeMo Guardrails = GPU-bound dialog control), or single-purpose (Llama Prompt Guard 2 = injection only, Llama Guard 3 = content moderation only).

3. **Critical gaps identified** :
   - LLM02 **Sensitive Information Disclosure** (jumped #6 → #2 in OWASP 2025) — LLM Guard `Anonymize` scanner not confirmed active in Musaium config ; investigate sidecar `requirements.txt`.
   - **LLM03 Supply Chain / AI-BOM** — no AI-BOM tracking (which embedding models, which LLM providers, dataset provenance) in repo as of 2026-05-12.
   - **LLM08 Vector & Embedding Weaknesses** (new 2025 entry) — Musaium uses pgvector for SigLIP artwork embeddings, but no signed provenance / source allowlist on the artwork catalog beyond manual curation.
   - **LLM10 Unbounded Consumption** — guardrail budget cap exists (`guardrail-budget.ts` + Redis per ADR-030), but **per-IP / per-anonymous-user token cap** not verified in research — only auth-user-keyed budget is visible from filenames.

4. **Recommended additions, in priority order** :
   - **(P0)** Confirm `Anonymize` scanner active in sidecar `requirements.txt` for PII redaction on user input before LLM call (LLM02 mitigation).
   - **(P1)** Consider **Llama Prompt Guard 2 22M** as a fast pre-filter on the sidecar Python side (BERT-style, 99% AUC, ~75% lower latency than 86M variant) — orthogonal signal to keyword filter, catches obfuscated injections (Base64, Unicode, encoding stacks) that keyword regex misses.
   - **(P1)** Add an **AI-BOM** doc (which models, which provider, which datasets, which embedding model versions) — required by OWASP LLM03 and EU AI Act Art. 50 transparency obligations starting 2026-08-02.
   - **(P2)** Watch **Anthropic Constitutional Classifiers++** (0.05% flag rate at +1% compute, no successful jailbreak after 1700h red-team hours, deployed on Claude Sonnet 4.5 production) — opaque to Musaium today but a competitive baseline for `gpt-4o-mini` providers ; relevant when evaluating provider-side safety claims.

5. **Verdict** : Stack is correct. Do **not** rewrite. Add `Anonymize` + AI-BOM + per-anonymous-user cap. Keep Promptfoo/Garak weekly. Re-evaluate moving from keyword pre-filter to Prompt-Guard-2 pre-filter post-launch V1 if injection bypass rate exceeds NFR-Safety threshold.

---

## 1. LLM Guard (Protect AI / Laiyer) — 2026 state

### Status
- Maintainer : Protect AI (Laiyer is the original team, acquired by Protect AI). Repo `protectai/llm-guard`, MIT licence.
- Current shipping version (per appsecsanta tracking) : v0.3.16, expanded PromptInjection model on Python 3.12.
- 15 input scanners + 20 output scanners. Each scanner runs independently — unused scanners cost nothing.
- 2.5M+ PyPI downloads. Active in 2026 (no archival).
- Self-hosted, no telemetry, no data leaves infra.

### Scanner taxonomy (input side, partial list)
`Anonymize` (PII placeholders + restore), `BanCode`, `BanCompetitors`, `BanSubstrings`, `BanTopics`, `Code`, `Gibberish`, `Language`, `PromptInjection` (ML-based, not regex), `Regex`, `Secrets`, `Sentiment`, `TokenLimit`, `Toxicity`.

### Deployment modes
1. **Python lib in-process** — minimal latency (no network hop), but couples Node.js/TypeScript stack to Python runtime (Musaium's backend is Node 22).
2. **Sidecar HTTP API (Docker)** — language-agnostic, isolates Python deps. Musaium's choice (`POST /scan/prompt` + `POST /scan/output` per `llm-guard.adapter.ts:155-166`). Latency cost = 1 network hop per check + scanner cost.
3. **Kubernetes** — same pattern, scaled horizontally.

### Performance
LLM Guard claims sub-10ms per check for lightweight scanners. Anonymize + PromptInjection together typically 50-150ms on CPU per Protect AI documentation. Musaium's circuit breaker + semaphore + `LLM_GUARD_TIMEOUT_MS` already bound this — fail-CLOSED on timeout.

### Sidecar vs in-process trade-off for Musaium
Sidecar is correct here :
- Node.js backend, Python sidecar — clean process isolation.
- Breaker + semaphore + fail-CLOSED is precisely the pattern that becomes essential **only** with a sidecar (no need if in-process).
- Cost = +1 RTT × 2 (input + output) per chat request, ~20-50ms in well-provisioned VPS. Acceptable for Voice V1 latency budget.

Sources :
- [protectai/llm-guard GitHub](https://github.com/protectai/llm-guard)
- [LLM Guard 2026 review (AppSec Santa)](https://appsecsanta.com/llm-guard)
- [LLM Guard scanners reference](https://llm-guard.com/input_scanners/ban_substrings/)
- [Protect AI integration & deployment guide](https://deepwiki.com/protectai/llm-guard/5-integration-and-deployment)

---

## 2. NeMo Guardrails (NVIDIA) — 2026 state

### Recent releases
- **IORails** — parallel execution engine for content-safety + topic-safety + jailbreak detection rails with unique request IDs and logging.
- **Async `check_async`** — standalone I/O validation without full conversation flow.
- **OpenAI-compatible server** — `/v1/models` endpoint, drop-in compatible. New `GuardrailsMiddleware` for LangChain.
- **LangChain 1.x support** — content blocks API, reasoning traces.
- Production microservice container available with Helm charts.

### Latency profile
- 100-300ms typical, 50-150ms on NVIDIA-optimised infra (GPU acceleration).
- Heavier than LLM Guard because NeMo's value-add is **dialog flow control / policy programming (Colang)**, not just I/O scanning.

### Comparison vs LLM Guard
- **Use NeMo if** : multi-turn agent with topic gating, RAG grounding rails, retrieval pre-flight checks, complex policy programming via Colang.
- **Use LLM Guard if** : I/O scanning only, CPU-bound, low-latency, no GPU available.
- Musaium has single-turn chat per message (per `chat.service.ts` orchestrator pattern, no agent loop) → **LLM Guard is the right primitive**. NeMo would be over-spec.

Sources :
- [NVIDIA-NeMo/Guardrails GitHub](https://github.com/NVIDIA-NeMo/Guardrails)
- [NeMo Guardrails Library docs](https://docs.nvidia.com/nemo/guardrails/latest/index.html)
- [NeMo Guardrails 2026 production guide (Spheron)](https://www.spheron.network/blog/nemo-guardrails-production-deployment-llm-gpu-cloud/)

---

## 3. Llama Guard 3 vs Llama Guard 4 — fact check

**Honest correction (UFR-013)** : the mission brief asked about "Llama Guard 3 vs 4". As of 2026-05-12 search, **there is no publicly released "Llama Guard 4"**. The current shipping line is :

- **Llama Guard 3 8B** (Llama-3.1-8B fine-tuned), 14 MLCommons hazard categories (S1-S14 : violent crimes, sex crimes, hate, self-harm, sexual content, child exploitation, defamation, privacy, IP, indiscriminate weapons, elections, etc.).
- **Llama Guard 3 1B** — distilled 1B variant. 0.94GB VRAM. ~76% accuracy. INT4 quantised = 7x smaller (on-device feasible).
- **Llama Guard 3-11B-vision** — multimodal variant.
- **Llama Guard 3 supports 8 languages** : English, French, German, Hindi, Italian, Portuguese, Spanish, Thai.

The "Llama Guard 4" reference in some sources refers to Llama Guard models tested **against Llama 4 Scout/Maverick** (the foundation model, not the guard), and a Llama Guard variant tested on Llama 4 that blocked 66.2% of attack prompts.

### Latency / accuracy snapshot
- Llama Guard 3 1B : best speed/accuracy/memory tradeoff (Guard 3 1B is the recommended on-device variant per Meta).
- Inference adds ~100-300ms per check at the 8B size on GPU, ~20-80ms at 1B size.

### Relevance to Musaium
Llama Guard is **content moderation** (does the output contain harmful content per MLCommons taxonomy). It is **not** a prompt-injection detector — that's Prompt Guard 2's job (see §6). For art-museum use case, Musaium's relevant categories are S10 (Hate), S12 (Sexual content), narrowly — most artwork conversations don't touch S1-S9. Could be useful as a **secondary output check** but adds a 1B model to the sidecar.

Sources :
- [Llama Guard 3 8B model card (Hugging Face)](https://huggingface.co/meta-llama/Llama-Guard-3-8B)
- [Llama Guard 3 docs (Meta)](https://www.llama.com/docs/model-cards-and-prompt-formats/llama-guard-3/)
- [Llama Guard 3 1B model card](https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard3/1B/MODEL_CARD.md)

---

## 4. Lakera Guard — 2026 (post-Check-Point acquisition)

### Acquisition impact
- **Check Point announced acquisition of Lakera for ~$300M** (Sept-Nov 2025 window, closed Q4 2025).
- Post-acquisition : Lakera's self-serve tier and enterprise positioning re-weighted toward larger Check Point Infinity customers.
- Free community plan still exists. Paid tiers start ~$99/month.

### Capabilities
- Single endpoint `POST /v2/guard`, OpenAI chat completions message format.
- 100+ languages.
- Sub-50ms latency for 1M+ TPS per app.
- Detects direct injection, indirect injection, jailbreaks, system prompt extraction.

### Relevance to Musaium
- Commercial API → **not self-hosted** → conflicts with Musaium's GDPR-first / data-residency posture (visitor data routing through Check Point in Israel is a privacy + jurisdictional concern for EU museum customers).
- Cost would scale with traffic ; Musaium's 2.5M-download OSS LLM Guard is free.
- **Verdict** : Lakera is a reasonable fallback if LLM Guard PromptInjection scanner detection rate proves insufficient post-launch, but **not the right first choice** for Musaium pre-launch V1.

Sources :
- [Check Point press release on Lakera acquisition](https://www.checkpoint.com/press-releases/check-point-acquires-lakera-to-deliver-end-to-end-ai-security-for-enterprises/)
- [Lakera Guard product page](https://www.lakera.ai/lakera-guard)
- [Lakera Guard 2026 review (AppSec Santa)](https://appsecsanta.com/lakera)
- [Lakera API documentation](https://docs.lakera.ai/docs/prompt-defense)

---

## 5. Rebuff — open-source prompt injection detector

### Status
- Maintainer : **Protect AI** (same org as LLM Guard, repo `protectai/rebuff`).
- Last updated : March 2026 (still active).
- Multi-layer defense :
  1. Heuristics (regex-style fast pre-filter)
  2. LLM-based detection (dedicated LLM call to classify the prompt)
  3. VectorDB embeddings of past attacks (self-hardening — adds new attacks to memory)
  4. Canary tokens (detect if LLM leaks portions of the system prompt)

### Verdict vs LLM Guard
- Rebuff is **focused on prompt injection only**, while LLM Guard is broader (PII, toxicity, secrets, etc.).
- LLM Guard's `PromptInjection` scanner does layers 1-2 of Rebuff's stack natively. The canary token mechanism is **not** in LLM Guard.
- Canary tokens are a **good additive control** for system prompt leakage (LLM07) — could be implemented in `chat.service.ts` by injecting a random token in the system prompt and grepping for it in output.

Sources :
- [protectai/rebuff GitHub](https://github.com/protectai/rebuff)
- [Rebuff: Detecting Prompt Injection Attacks (LangChain Blog)](https://blog.langchain.com/rebuff/)

---

## 6. Meta PurpleLlama / LlamaFirewall + Prompt Guard 2

### LlamaFirewall (April 2025, used in production at Meta)
- Open-source guardrail system for AI agents.
- Components :
  - **PromptGuard 2** — real-time direct injection + jailbreak detection (BERT-style, two variants : 86M and 22M params).
  - **AlignmentCheck** — inspects agent reasoning for goal hijacking / indirect injection.
  - **CodeShield** — online static analysis on AI-generated code.
  - **Regex filters**.
- Modular, low-latency, designed for high-throughput pipelines.

### Prompt Guard 2 86M — performance numbers
- AUC ROC : **~0.99 on test set, 0.98-0.99 OOD**.
- Attack Success Rate reduction : baseline ASR 17.6% → **7.5% with PG2 86M alone** (57% drop).
- Adversarial-resistant tokenization (whitespace manipulation, fragmented tokens).
- Multi-language support.

### Prompt Guard 2 22M — DeBERTa-xsmall variant
- **75% latency reduction** vs 86M with minimal performance trade-off.
- CPU-deployable. Ideal for real-time pre-filter.

### Relevance to Musaium
**This is the most actionable recommendation in the report**. The keyword regex pre-filter (`art-topic-guardrail.ts` INJECTION_PATTERNS, 8 languages) catches **only direct, written-in-cleartext** injection attempts. PG2 22M would catch :
- Base64/ROT-13/Unicode-obfuscated injections that pass the regex.
- Cross-language adversarial wordings the keyword list doesn't enumerate.
- Whitespace/fragmented-token bypasses.

**Integration cost** : add PG2 22M ONNX model to the sidecar `requirements.txt` + a new scanner module + wire into `/scan/prompt`. ~3-5 days of work. Latency cost on CPU = ~10-30ms additional. Net : worth re-evaluating post-launch V1 once injection bypass rate is measured by Garak/Promptfoo weekly runs.

Sources :
- [Llama Prompt Guard 2 86M model card (Hugging Face)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M)
- [LlamaFirewall paper (arXiv 2505.03574)](https://arxiv.org/html/2505.03574v1)
- [LlamaFirewall docs](https://meta-llama.github.io/PurpleLlama/LlamaFirewall/)
- [PurpleLlama GitHub](https://github.com/meta-llama/PurpleLlama)
- [Llama Prompt Guard 2 22M model card](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-22M)

---

## 7. Anthropic Constitutional Classifiers / PromptShields

### Status (2026)
- Anthropic released **Constitutional Classifiers++** — next-generation defense.
- Two-stage architecture : a **cheap probe** looks at Claude's internal activations (very low cost) → screens all traffic → expensive classifier only on flagged. Internal-activations approach is opaque to API customers.
- **Production results on Claude Sonnet 4.5** (Dec 2025 — Jan 2026) : flag rate **0.05%** (down from 0.38% in prior generation). +1% compute overhead.
- **No universal jailbreak found** after 1700 cumulative red-team hours.
- 87% reduction in over-refusals on harmless requests.

### Constitution document (Jan 2026, 80 pages)
- New approach : teach Claude **why** to behave (rationale-based), not just **what** rules to follow. Improves generalisation to novel scenarios.
- Used during training to generate synthetic data + example interactions.

### Relevance to Musaium
- **Not directly actionable** — these classifiers are inside Anthropic, not exposed as an API.
- **Strategic context** : if Musaium switches LLM provider to Claude, you get Constitutional Classifiers for free at the provider boundary, on top of the LLM Guard sidecar.
- Today Musaium uses OpenAI (`gpt-4o-mini-transcribe`, `gpt-4o-mini-tts`). OpenAI does not publish an equivalent classifier track record. The 3-layer Musaium stack is **the right hedge** against an opaque provider safety posture.

Sources :
- [Anthropic - Next-generation Constitutional Classifiers](https://www.anthropic.com/research/next-generation-constitutional-classifiers)
- [Constitutional Classifiers: Defending against universal jailbreaks (Anthropic Research)](https://www.anthropic.com/research/constitutional-classifiers)
- [Constitutional Classifiers paper (arXiv 2501.18837)](https://arxiv.org/pdf/2501.18837)
- [InfoQ: Anthropic Releases Updated Constitution for Claude](https://www.infoq.com/news/2026/01/anthropic-constitution/)

---

## 8. IBM Granite Guardian 4.1 (April 2026)

### Status
- **Granite Guardian 4.1** — fine-tuned on Granite 4.1 8B. Direct replacement for Granite Guardian 3.3 8B.
- Detects : social bias, hate/abuse/profanity, hallucinations, agentic risks, jailbreak attempts, plus IBM AI Risk Atlas categories.
- New **Bring Your Own Criteria (BYOC)** — define arbitrary judging criteria (formatting rules, length constraints, domain-specific instructions).
- **Tops GuardBench** — IBM holds 6 of top 10 spots on this independent benchmark of guardrail classifiers.

### Relevance to Musaium
- Direct OSS alternative to LLM Guard's PromptInjection scanner.
- 8B model size = significant compute. Same trade-off as Llama Guard 3 8B.
- BYOC is the differentiator — could encode "art-topic only" as a BYOC rule and replace `art-topic-guardrail.ts`. But Musaium's keyword approach is multilingual (8 languages, 41 insult words) and runs in microseconds vs Granite Guardian's 8B model call.
- **Verdict** : Watch, do not adopt now.

Sources :
- [IBM Granite Guardian 4.1 (IBM Research blog)](https://research.ibm.com/blog/granite-guardian-tops-guardbench)
- [ibm-granite/granite-guardian GitHub](https://github.com/ibm-granite/granite-guardian)
- [What is Granite Guardian? (IBM Think)](https://www.ibm.com/think/topics/granite-guardian)

---

## 9. OWASP LLM Top 10 2025 — full list with Musaium status

Authoritative source : [OWASP Gen AI Security Project](https://genai.owasp.org/llm-top-10/) + [OWASP Top 10 LLM Applications 2025 PDF v4.2.0a](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf).

| ID | Risk | Musaium status | Notes |
|----|------|---------------|-------|
| **LLM01:2025** | **Prompt Injection** | **Covered ✓** | 3-layer : keyword regex (8 lang) → LLM Guard PromptInjection ML model → output regex. Promptfoo OWASP LLM07 corpus tests this weekly. **Gap** : indirect injection (RAG poisoning) not in scope for V1 — wikidata adapter has circuit breaker (ADR-039) but no content scrubbing on retrieved docs. |
| **LLM02:2025** | **Sensitive Information Disclosure** (#6 → #2) | **Partial ⚠️** | `Anonymize` scanner availability in sidecar `requirements.txt` not confirmed by R4 research. **P0 action** : verify and enable if missing. System prompt restrictions exist (see CLAUDE.md "AI Safety" section). |
| **LLM03:2025** | **Supply Chain** | **Gap ✗** | No AI-BOM in repo. Provider list = ENV-driven multi-LLM (OpenAI / Deepseek / Google), embedding = SigLIP ONNX (ADR-037). **P1 action** : create `docs/AI_BOM.md` listing model + version + provider + dataset provenance. Required for EU AI Act Art. 53 GPAI documentation. |
| **LLM04:2025** | **Data and Model Poisoning** | **Partial ✓** | Musaium does not fine-tune models. Risk surface : embedding corpus (artwork catalog `daily-art/artworks.data.ts` is static/curated). RAG grounding via Wikidata = third-party data, **vetting policy not documented**. Recommend ADR or section in `docs/AI_SAFETY.md` (if extracted). |
| **LLM05:2025** | **Improper Output Handling** | **Covered ✓** | LLM output passed through output guardrail regex + LLM Guard sidecar `/scan/output`. Output is structured (markdown text, audio buffer) — no `eval`, no SQL string interp, no shell exec. |
| **LLM06:2025** | **Excessive Agency** | **Covered ✓** | Musaium chat is read-only Q&A on art. No tools/functions exposed to LLM. No agent loop. No autonomous actions on user accounts. |
| **LLM07:2025** | **System Prompt Leakage** | **Partial ✓** | Promptfoo `promptfoo-systemprompt-leak.yaml` smoke test exists. **Gap** : no canary token mechanism (Rebuff §5). Recommend P2. |
| **LLM08:2025** | **Vector and Embedding Weaknesses** (new 2025) | **Partial ⚠️** | pgvector + SigLIP halfvec(768) for artwork similarity (ADR-037). PoisonedRAG-style attack (USENIX 2025 : 90%+ ASR with 5 malicious texts) is **theoretical risk** today because corpus is curated. **P1 action** : if/when user-uploaded artwork is allowed (rejected per project_c2_ai_side_only memory), revisit. |
| **LLM09:2025** | **Misinformation** | **Partial ✓** | Anti-hallucination citations + websearch (ADR-038) reduce risk on factual claims. No grounding score gate today — output passes through guardrail regex but no factuality check. |
| **LLM10:2025** | **Unbounded Consumption** | **Partial ⚠️** | `guardrail-budget.ts` + Redis (ADR-030) caps LLM Guard judge calls. **Gap** : per-IP / per-anonymous-user **token cap** on the chat endpoint not verified from filenames. Rate limit module (`shared/rate-limit/`) exists — confirm policy. Denial-of-Wallet via repeated `gpt-4o-mini` calls without auth is the failure mode. |

Sources :
- [OWASP LLM Top 10 2025 (canonical)](https://genai.owasp.org/llm-top-10/)
- [LLM02:2025 Sensitive Information Disclosure](https://genai.owasp.org/llmrisk/llm02-insecure-output-handling/)
- [LLM04:2025 Data and Model Poisoning](https://genai.owasp.org/llmrisk/llm042025-data-and-model-poisoning/)
- [LLM10:2025 Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/)

---

## 10. Adversarial testing : Garak vs Promptfoo vs Giskard (2026)

### Garak (NVIDIA, v0.14.1 shipped April 2026)
- **120+ probe modules** (was 37+ in earlier reporting — 2026 update).
- 23 model backends.
- Probe taxonomy : `promptinject` (Agency Enterprise framework), `dan` (full DAN family), `encoding` (Base64/ROT-13 stacks), `leakreplay` (training-data extraction), `packagehallucination` (fake PyPI/npm names), `malwaregen`, `xss`, `tap` (Tree of Attack with Pruning).
- CLI-first, manual CI/CD integration.
- Paper : Derczynski et al., [arXiv 2406.11036, June 2024](https://arxiv.org/abs/2406.11036).
- 2024 comparative analysis paper ([arXiv 2410.16527](https://arxiv.org/abs/2410.16527)) flagged **reliability issues in detecting successful attacks** across Garak, Giskard, PyRIT, CyberSecEval — worth reading before relying on a single tool's verdict.

### Promptfoo (OSS, MIT, acquired by OpenAI March 2026)
- **50+ attack plugins**.
- First-class CI/CD support — npm package + GitHub Actions + YAML configs (Musaium uses this in `scripts/llm-security/`).
- Plugins : OWASP LLM Top 10 preset, OWASP Top 10 for Agentic Applications (Black Hat Europe 2025).
- Adaptive Red Teaming (smart agents generate context-specific attacks).
- Agent Tracing, MCP Testing, Multi-round Testing.
- Compliance Mapping : OWASP / NIST / MITRE ATLAS.

### Giskard
- Diverse static + LLM-based attack-evaluation pairs (9 attack types).
- Strong on hallucination + stereotypes + information disclosure.
- Versioned slower than Garak (~v2.14.4 reference).

### Verdict for Musaium
ADR-049 picks **Promptfoo + Garak** — exactly the recommended pair :
- Garak = deep model-layer probing (122+ probes).
- Promptfoo = app-layer red teaming + CI/CD integration (already wired in `museum-backend/security/promptfoo/promptfooconfig.yaml`).
- Giskard adds little marginal value given Garak's coverage.

Sources :
- [garak: A Framework for Security Probing Large Language Models (arXiv)](https://arxiv.org/abs/2406.11036)
- [NVIDIA/garak GitHub](https://github.com/NVIDIA/garak)
- [Insights and Current Gaps in Open-Source LLM Vulnerability Scanners (arXiv 2410.16527)](https://arxiv.org/abs/2410.16527)
- [Promptfoo Red Team Configuration](https://www.promptfoo.dev/docs/red-team/configuration/)
- [Promptfoo OWASP LLM Top 10 plugin](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/)
- [Promptfoo vs Garak (Promptfoo blog)](https://www.promptfoo.dev/blog/promptfoo-vs-garak/)

---

## 11. Defense-in-depth pattern (industry 2026)

Canonical pattern from 2026 OWASP guidance + Repello AI playbook + LlamaFirewall paper :

```
[Layer 1 - Org/Governance]   AI-BOM, policies, training, audits
[Layer 2 - App/API]          AuthN, AuthZ, rate limit, input validation, schema check
[Layer 3 - Pre-flight]       Keyword pre-filter (fast) → ML injection classifier (PG2 / LLM Guard PromptInjection)
[Layer 4 - LLM Provider]     Provider-side safety (Constitutional Classifiers on Anthropic / opaque on OpenAI)
[Layer 5 - Post-flight]      Output scanner (Anonymize, Toxicity, MaliciousURL, NoRefusal)
[Layer 6 - Audit]            Immutable audit log → SIEM. Min 6 months retention, 3-7y for finance/health.
[Layer 7 - Budget/Cap]       Per-request token cap, per-user/IP daily quota, circuit breaker on provider failure
```

### Musaium's stack mapped
- L1 — **Gap** : AI-BOM missing.
- L2 — `shared/rate-limit/`, JWT auth, Zod validation. Looks correct.
- L3 — Keyword filter (`art-topic-guardrail.ts`) + LLM Guard sidecar. **Missing** : PG2-class ML pre-filter is optional uplift.
- L4 — OpenAI today. No control over provider-side safety.
- L5 — Output guardrail + LLM Guard `/scan/output`. Correct.
- L6 — `useCase/guardrail/guardrail-audit-payload.ts` exists. Retention policy : not confirmed by R4.
- L7 — `guardrail-budget.ts` + circuit breaker. Per-anonymous-user cap not verified.

Sources :
- [Defense in Depth AI Cybersecurity 2026 (SentinelOne)](https://www.sentinelone.com/cybersecurity-101/cybersecurity/defense-in-depth-ai-cybersecurity/)
- [OWASP LLM Top 10 2026 Complete Guide (Repello AI)](https://repello.ai/blog/owasp-llm-top-10-2026)
- [LlamaFirewall paper (arXiv 2505.03574)](https://arxiv.org/html/2505.03574v1)
- [Audit Logs for LLM Pipelines (Newline)](https://www.newline.co/@zaoyang/audit-logs-for-llm-pipelines-key-practices--a08f2c2d)

---

## 12. Bonus : EU AI Act Article 50 — 2026-08-02 deadline

- Article 50 transparency obligations apply **from 2 August 2026**.
- Chatbots and voice assistants : providers **must inform users they are interacting with an AI system** (unless obvious — narrow exception).
- Musaium has shipped AI Act Art. 50 disclosure per the mission brief — confirm placement covers both web AND mobile app entry points.
- Generative content (LLM responses, AI-generated audio via TTS) : **must be marked machine-readable** as AI-generated. The Code of Practice on marking + labelling of AI content is being drafted. Watch this — for Musaium's TTS audio, this may mean embedding metadata.
- GPAI Article 53 documentation obligations interact with LLM03 (Supply Chain) AI-BOM recommendation above.

Sources :
- [Article 50 (artificialintelligenceact.eu)](https://artificialintelligenceact.eu/article/50/)
- [Draft Guidelines on transparency (European Commission)](https://digital-strategy.ec.europa.eu/en/library/draft-guidelines-implementation-transparency-obligations-certain-ai-systems-under-article-50-ai-act)
- [Bird & Bird : AI Act Transparency Code of Practice](https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-understanding-the-draft-transparency-code-of-practice)

---

## 13. Verdict

### Musaium's 3-layer stack is correct
The combination of **keyword pre-filter → LLM Guard fail-CLOSED sidecar (with circuit breaker + inflight semaphore + audit) → output keyword filter + Promptfoo/Garak weekly + AI Act Art. 50 disclosure** matches the 2026 industry-leading pattern for self-hosted, GDPR-friendly, multi-provider chat applications. Recent commits `e45490c1` and `c38b5c87` (LLM Guard fail-CLOSED + breaker + semaphore + audit, May 2026) put Musaium **ahead of typical 2026 deployments** on reliability semantics.

### Do NOT rewrite. Do NOT add NeMo Guardrails or Granite Guardian today.
- NeMo : over-spec for single-turn Q&A, GPU-bound.
- Granite Guardian : 8B model, no clear win over LLM Guard.
- Lakera : commercial, Check-Point-routing privacy concern.

### Add these, in priority order

**(P0) Confirm `Anonymize` scanner is active** in `ops/llm-guard-sidecar/requirements.txt` + scanner config. PII redaction on user input is the **highest-priority gap** vs OWASP LLM02 (jumped #6 → #2 in 2025).

**(P1) Create `docs/AI_BOM.md`** with : LLM providers + versions + datasets, embedding model (SigLIP version), TTS model, STT model, third-party data sources (Wikidata). Required for OWASP LLM03 + EU AI Act Art. 53.

**(P1) Confirm rate limit + per-anonymous-user token quota** is wired on `/chat` endpoint. Mitigates LLM10 (Unbounded Consumption / Denial-of-Wallet).

**(P2) Add Llama Prompt Guard 2 22M** as a second pre-filter in the sidecar. ~0.99 AUC on injection detection, ~75% lower latency than 86M variant, BERT-style CPU-deployable. Reduces ASR for obfuscated injections that pass keyword regex.

**(P2) Add canary token mechanism** to system prompt (Rebuff-style). Output regex check for token leak → strong signal for LLM07 system prompt leakage. ~1 day work.

**(P2) Document RAG grounding vet policy** for Wikidata content (LLM04). Even if today low-risk, having a written policy is required under EU AI Act Annex IV technical documentation.

**(P3) Watch Constitutional Classifiers++** — when OpenAI publishes an equivalent or Musaium evaluates moving to Anthropic for cost/quality, factor in the +1% compute / 0% jailbreak track record into the provider trade-off.

### Anti-recommendations (FORBIDDEN)
- **Do NOT fail-OPEN** if LLM Guard sidecar is down. Recent commit `e45490c1` "restore LLM Guard fail-CLOSED" is the correct posture. Reverting is a regression.
- **Do NOT bypass the keyword pre-filter** in tests or under load. It's microsecond-cheap and language-agnostic.
- **Do NOT add a third opaque commercial provider** (Lakera, Galileo, Guardrails AI hosted) before V1. Cost + latency + data-residency cost outweighs marginal coverage uplift.

---

## Sources (consolidated)

### LLM Guard / Protect AI
- [protectai/llm-guard GitHub](https://github.com/protectai/llm-guard)
- [LLM Guard 2026 review](https://appsecsanta.com/llm-guard)
- [Inside LLM Guard (LevelUp)](https://levelup.gitconnected.com/inside-llm-guard-the-ultimate-toolkit-for-secure-language-ai-0539f4375c87)
- [Protect AI integration & deployment](https://deepwiki.com/protectai/llm-guard/5-integration-and-deployment)

### NeMo Guardrails
- [NVIDIA-NeMo/Guardrails GitHub](https://github.com/NVIDIA-NeMo/Guardrails)
- [NeMo Guardrails docs](https://docs.nvidia.com/nemo/guardrails/latest/index.html)
- [NeMo Guardrails production deployment (Spheron)](https://www.spheron.network/blog/nemo-guardrails-production-deployment-llm-gpu-cloud/)

### Llama Guard / Prompt Guard / LlamaFirewall (Meta)
- [Llama Guard 3 8B (Hugging Face)](https://huggingface.co/meta-llama/Llama-Guard-3-8B)
- [Llama Guard 3 1B model card](https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard3/1B/MODEL_CARD.md)
- [Llama Prompt Guard 2 86M (HF)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M)
- [Llama Prompt Guard 2 22M (HF)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-22M)
- [LlamaFirewall paper (arXiv 2505.03574)](https://arxiv.org/html/2505.03574v1)
- [LlamaFirewall docs](https://meta-llama.github.io/PurpleLlama/LlamaFirewall/)

### Lakera
- [Lakera Guard](https://www.lakera.ai/lakera-guard)
- [Check Point press release on Lakera acquisition](https://www.checkpoint.com/press-releases/check-point-acquires-lakera-to-deliver-end-to-end-ai-security-for-enterprises/)
- [Lakera API documentation](https://docs.lakera.ai/docs/prompt-defense)

### Rebuff
- [protectai/rebuff GitHub](https://github.com/protectai/rebuff)
- [Rebuff: Detecting Prompt Injection Attacks (LangChain Blog)](https://blog.langchain.com/rebuff/)

### Anthropic Constitutional AI
- [Next-generation Constitutional Classifiers](https://www.anthropic.com/research/next-generation-constitutional-classifiers)
- [Constitutional Classifiers (Anthropic)](https://www.anthropic.com/research/constitutional-classifiers)
- [Constitutional Classifiers paper (arXiv 2501.18837)](https://arxiv.org/pdf/2501.18837)
- [InfoQ: Anthropic Releases Updated Constitution for Claude (Jan 2026)](https://www.infoq.com/news/2026/01/anthropic-constitution/)

### Granite Guardian (IBM)
- [Granite Guardian tops GuardBench (IBM Research)](https://research.ibm.com/blog/granite-guardian-tops-guardbench)
- [ibm-granite/granite-guardian GitHub](https://github.com/ibm-granite/granite-guardian)
- [What is Granite Guardian? (IBM Think)](https://www.ibm.com/think/topics/granite-guardian)

### OWASP LLM Top 10 2025
- [OWASP LLM Top 10 2025 (canonical)](https://genai.owasp.org/llm-top-10/)
- [OWASP Top 10 LLM PDF v4.2.0a](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf)
- [LLM02 Sensitive Information Disclosure](https://genai.owasp.org/llmrisk/llm02-insecure-output-handling/)
- [LLM04 Data and Model Poisoning](https://genai.owasp.org/llmrisk/llm042025-data-and-model-poisoning/)
- [LLM10 Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/)
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

### Adversarial testing
- [garak paper (arXiv 2406.11036)](https://arxiv.org/abs/2406.11036)
- [NVIDIA/garak GitHub](https://github.com/NVIDIA/garak)
- [Insights and Current Gaps in OSS LLM Scanners (arXiv 2410.16527)](https://arxiv.org/abs/2410.16527)
- [Promptfoo OWASP LLM Top 10 plugin](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/)
- [Promptfoo Red Team Configuration](https://www.promptfoo.dev/docs/red-team/configuration/)
- [Promptfoo vs Garak](https://www.promptfoo.dev/blog/promptfoo-vs-garak/)

### Defense in depth & audit
- [Defense in Depth AI Cybersecurity 2026 (SentinelOne)](https://www.sentinelone.com/cybersecurity-101/cybersecurity/defense-in-depth-ai-cybersecurity/)
- [OWASP LLM Top 10 2026 Complete Guide (Repello AI)](https://repello.ai/blog/owasp-llm-top-10-2026)
- [Audit Logs for LLM Pipelines (Newline)](https://www.newline.co/@zaoyang/audit-logs-for-llm-pipelines-key-practices--a08f2c2d)
- [LLM Observability Complete Guide 2026 (Portkey)](https://portkey.ai/blog/the-complete-guide-to-llm-observability/)

### EU AI Act
- [Article 50 (artificialintelligenceact.eu)](https://artificialintelligenceact.eu/article/50/)
- [Draft Guidelines on transparency (EC)](https://digital-strategy.ec.europa.eu/en/library/draft-guidelines-implementation-transparency-obligations-certain-ai-systems-under-article-50-ai-act)
- [Bird & Bird : AI Act Transparency Code of Practice](https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-understanding-the-draft-transparency-code-of-practice)

### Prompt Injection (research)
- [Prompt Injection Survey (CMC)](https://www.techscience.com/cmc/v87n1/66084/html)
- [Prompt Injection Attacks Review (MDPI)](https://www.mdpi.com/2078-2489/17/1/54)
- [Prompt Injection 2026 Security Guide (CygenIQ)](https://cygeniq.ai/blog/prompt-injection-attacks-risks-and-preventions/)

---

## Honesty disclosures (UFR-013)

- **Claimed and corrected** : "Llama Guard 4" does not exist as a published product (§3). Verified by 2 distinct web searches.
- **Did not verify directly** : Musaium's `ops/llm-guard-sidecar/requirements.txt` contents (would require BE filesystem read at path outside ports scoped for R4). Marked as P0 action item rather than claimed fact.
- **Did not verify directly** : whether `/chat` endpoint enforces per-IP / per-anonymous-user rate limit. Marked as P1 to confirm.
- **Did not verify directly** : retention policy on `guardrail-audit-payload.ts` audit log. Mentioned as gap to confirm.
- **External sources cited only when read** : all 30+ source URLs above came back as search results during R4 research session 2026-05-12. No URL is fabricated — each appeared in WebSearch result lists.
- **One source caveat** : [arXiv 2410.16527 (2024)](https://arxiv.org/abs/2410.16527) reports reliability issues across Garak/Giskard/PyRIT/CyberSecEval. Findings from a single tool's output should be cross-checked.
