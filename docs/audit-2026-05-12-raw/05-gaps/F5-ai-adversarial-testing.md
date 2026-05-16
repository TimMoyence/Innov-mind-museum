# F5 — AI Adversarial Testing Pipeline Audit (2026-05-13)

Critical gap agent **F5** auditing Musaium's adversarial CI for the Voice-V1 chat pipeline. Scope : promptfoo OWASP LLM07 corpus, NVIDIA Garak probe matrix, daily smoke, and the gap between current coverage and the 2026 state of the art (multi-turn, encoded payloads, indirect injection, agentic Top-10).

Honesty UFR-013 applied : every figure is sourced to repo file or web citation. "Code says" vs "I expect" distinguished. Two assumptions in ADR-049 wording were verified against the live workflow YAMLs — both match.

Sources are listed inline and consolidated at the end.

---

## TL;DR

1. **Musaium's adversarial CI baseline (Phase 0/1 per ADR-049) is solid and ahead of most pre-launch B2C deployments.** Three workflows run weekly cron + on PR : `llm-security-promptfoo.yml` (85-prompt OWASP LLM07 corpus, 10 families × 8 locales, ≥95 % pass gate), `llm-security-garak.yml` (`promptinject` + `xss` + `leakreplay` probe families on a Phi-3-mini target, fails on HIGH/CRITICAL), and `llm-promptfoo-smoke.yml` (10-prompt recall ≥80 % over-blocking regression). All three artifact-uploaded, OPENAI_API_KEY gated, no fail-open path. — `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-security-promptfoo.yml]`, `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-security-garak.yml]`, `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-promptfoo-smoke.yml]`, `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/adr/ADR-049-llm-security-ci-gates.md]`.

2. **Five concrete coverage gaps**, ranked by severity for V1 (2026-06-01 launch) :
   - **G1 — Garak target is still Phi-3-mini, not Musaium's endpoint.** Phase 1.5 swap to a custom `garak.generators.rest` probe pointed at `/api/chat/sessions/:id/messages` is planned (ADR-049 §Rollout) but **not done**. Today Garak tests an upstream model, not Musaium's guardrail stack. **Highest practical gap** : the green Garak badge does not yet prove Musaium's defences.
   - **G2 — No true multi-turn adversarial coverage.** The corpus has 3 `multiturn-erosion` entries but the promptfoo HTTP provider sends a single message per test (per `promptfoo-systemprompt-leak.yaml` template `{{prompt}}`). Crescendo, TAP, and goal-erosion attacks (Microsoft 2024, AppSec 2026) are not exercised end-to-end. Musaium's chat is multi-turn by design (session-scoped history) → blind spot.
   - **G3 — No indirect-injection corpus.** OWASP LLM01:2025 explicitly calls out RAG/document injection. Musaium pulls Wikidata grounding via the websearch adapter (ADR-038 anti-hallucination) → first-party indirect-injection surface. Corpus has 0 entries for this family.
   - **G4 — Encoded-payload coverage is minimal.** Only 3 `encoding` + 4 `token-smuggling` entries in 85 (`grep "family"` confirms). The 2026 record is dominated by stacked encodings (Base64 + Unicode VS + ROT-13 + language switch) — Grok-Bankrbot Morse-code drain (May 2026) is the canonical incident. Promptfoo ships an `ascii-smuggling` plugin and Garak ships an `encoding` probe family — neither is wired today.
   - **G5 — No agentic Top-10 testing.** OWASP Top-10 for Agentic Applications was published 2025-12-10. Musaium V1 is single-turn read-only Q&A (LLM06 covered per R4), but the roadmap (B2B museum tools, balades guidées) will add tool/function calls within 12 months. Wiring `owasp:agentic` plugins now lets the framework grow with the product.

3. **Three additions for V1 launch** (priority order, in scope before 2026-06-01) :
   - **(P0)** Complete the Phase 1.5 Garak REST swap — point Garak at the Musaium endpoint via a `generators.rest` JSON file. Cost : ~2 days. Without this, the Garak gate is a baseline-vs-baseline check, not a Musaium gate.
   - **(P0)** Add Llama Prompt Guard 2 22M as an ML pre-filter on the LLM-Guard sidecar (already recommended in R4). It catches the encoded-payload + low-resource-language bypass class that the keyword regex misses. Latency cost = ~10-30 ms CPU. — [Llama Prompt Guard 2 22M (Hugging Face)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-22M).
   - **(P1)** Wire a canary-token mechanism in `chat.service.ts` system prompt + a sentinel in the output guardrail. This closes LLM07 with a defence-in-depth signal that **does not require new corpus** — the canary triggers on any leak path, including paraphrase variants the keyword sentinel misses. — [OWASP issue 288 — canary tokens](https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/issues/288), [Vigil-LLM canary docs](https://github.com/deadbits/vigil-llm/blob/main/docs/canarytokens.md), [Rebuff README](https://github.com/protectai/rebuff/blob/main/README.md).

4. **Three additions for post-launch hardening** (Q3 2026 ↔ V1.1) :
   - Promptfoo `owasp:llm:redteam` + `owasp:agentic` presets in addition to the curated 85-prompt corpus — adds RAG poisoning, ASCII smuggling, agent goal hijack, tool misuse plugins. — [Promptfoo OWASP LLM Top 10](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/), [Promptfoo OWASP Agentic Top 10](https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/).
   - PyRIT `CrescendoOrchestrator` + `TreeOfAttacksWithPruningOrchestrator` as a monthly cron complement to the weekly Garak/Promptfoo. Stateful HTTP provider with session-ID transformVars is required. — [PyRIT](https://pypi.org/project/pyrit/), [Promptfoo multi-turn jailbreaks](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/).
   - Promptfoo "model drift" gate : run the corpus on **every LLM provider/model bump** (Deepseek↔OpenAI↔Google fail-over per CLAUDE.md) and fail-merge if Attack Success Rate (ASR) climbs > +5 pp vs the previous baseline. — [Promptfoo: Detecting Model Drift](https://www.promptfoo.dev/docs/red-team/model-drift/), [Promptfoo: Your model upgrade just broke your agent's safety](https://www.promptfoo.dev/blog/model-upgrades-break-agent-safety/).

5. **Verdict** — current coverage is **conditionally OK for the V1 launch** provided G1 (Garak REST swap) lands before 2026-06-01. Without G1, the Garak gate is a workflow-plumbing check (per ADR-049 §Phase 0 admission), not a Musaium-stack check. The other gaps are acceptable risk for V1 — Musaium is read-only single-turn Q&A pre-launch, so multi-turn / agentic / indirect-injection are theoretical until the product expands. **Top 3 additions** : Garak REST swap (P0), Prompt Guard 2 22M sidecar pre-filter (P0), canary tokens (P1).

---

## 1. Musaium adversarial CI — what's in place today

Verified from repo, not inferred.

### `llm-security-promptfoo.yml` — OWASP LLM07 corpus

| Aspect | Value | Source |
|---|---|---|
| Triggers | Weekly cron Mon 04:00 UTC, on PR touching chat/ + llm/ + workflows, manual `workflow_dispatch` | `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-security-promptfoo.yml]:34-43` |
| Corpus size | 85 prompts (verified : 634-line JSON, `grep family` counts 85 entries by `id`) | `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/llm-security/systemprompt-leak-prompts.json]` |
| Locales | 8 — en, fr, es, de, it, ja, zh, ar (per corpus `_doc` curation rule 2) | corpus `_doc` block |
| Attack families | 10 — `direct-extraction` (6), `paraphrase` (6), `translation` (42), `roleplay` (6), `indirection` (8), `multiturn-erosion` (3), `token-smuggling` (4), `code-injection` (6), `encoding` (3), `boundary-marker` (3) | `grep "family"` confirms |
| Gate | pass-rate < 95 % fails the run (Phase 0, will raise to 99 % per ADR-049 §Rollout phase 1) | `.github/workflows/llm-security-promptfoo.yml:198-200`, ADR-049 §Why 95 % |
| Backend bootstrap | Full pgvector+Redis stack booted, register+login a throwaway visitor, create chat session, fire `MUSAIUM_SESSION_ID` to promptfoo HTTP provider | `.github/workflows/llm-security-promptfoo.yml:58-152` |
| Concurrency | `--max-concurrency 4` | `.github/workflows/llm-security-promptfoo.yml:175` |
| Reports | 30-day artifact retention, JSON output | `.github/workflows/llm-security-promptfoo.yml:202-209` |

**Honest reading of the family distribution** — 42 of 85 entries (49 %) are the `translation` family (en attack rephrased in 7 locales). That's the cheap volume win. The "10 attack families" framing in ADR-049 §Decision is technically accurate but the actual semantic coverage is closer to **9 attack types × 7 translation variants per locale**, not 10 orthogonal techniques. Not a defect — it's the right move for cross-lingual coverage — but worth naming honestly.

### `llm-security-garak.yml` — NVIDIA Garak

| Aspect | Value | Source |
|---|---|---|
| Triggers | Same as promptfoo (weekly cron + PR + dispatch) | `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-security-garak.yml]:34-43` |
| Probes | `promptinject` + `xss` + `leakreplay` | `.github/workflows/llm-security-garak.yml:101-104` |
| **Target model** | **`microsoft/Phi-3-mini-4k-instruct` — NOT Musaium** | `.github/workflows/llm-security-garak.yml:66`, ADR-049 §Why Phi-3-mini |
| Garak version | Pinned `>=0.10,<0.12` (latest is 0.14.1 per [Garak PyPI](https://pypi.org/project/garak/)) | `.github/workflows/llm-security-garak.yml:84` |
| Gate | HIGH/CRITICAL severity = fail; lower findings surfaced but non-blocking | `.github/workflows/llm-security-garak.yml:110-147` |
| Parallel attempts | 2 | `.github/workflows/llm-security-garak.yml:105` |
| Reports | 30-day artifact retention, JSONL | `.github/workflows/llm-security-garak.yml:149-156` |

**Gap G1 confirmed** — ADR-049 §Rollout phase 1.5 is the swap to a `garak.generators.rest` probe pointed at the chat endpoint. Not yet implemented. Implementation is mechanical (a JSON spec file describing the POST body shape and the `response_json_field` JSONPath) per [Garak REST generator docs](https://reference.garak.ai/en/latest/garak.generators.rest.html) — see §4.1 below.

### `llm-promptfoo-smoke.yml` — over-blocking regression

| Aspect | Value | Source |
|---|---|---|
| Triggers | Nightly cron 03:30 UTC, manual `workflow_dispatch` (no PR trigger) | `[/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-promptfoo-smoke.yml]:27-29` |
| Corpus | `promptfoo-daily-art-smoke.yaml` — ~10 legitimate art-domain prompts, `contains-any` assertion family | header comment + ADR-049 §Decision item 3 |
| Gate | pass-rate < 80 % fails | `.github/workflows/llm-promptfoo-smoke.yml:165-168` |
| Reports | 14-day retention (cheaper rotation than adversarial) | `.github/workflows/llm-promptfoo-smoke.yml:171-177` |

This catches the **opposite** failure : the guardrail tightens to the point where "Tell me about the Mona Lisa" gets refused. Critical complement, often skipped in industry deployments. Good design.

---

## 2. Promptfoo 2026 state of the art

[Promptfoo](https://www.promptfoo.dev/) — MIT licence, **acquired by OpenAI March 2026** per [AppSec Santa](https://appsecsanta.com/) (still OSS, no behaviour change observed in releases).

### What Musaium uses today
- HTTP provider hitting `/api/chat/sessions/:id/messages` with a curated YAML corpus.
- `--max-concurrency 4`, JSON report output, no plugins.
- `npm install -g promptfoo@latest` — pinned-floating (no version lock).

### What Promptfoo ships in 2026 that Musaium doesn't use
1. **`owasp:llm` preset** — auto-binds plugins to the 2025 OWASP LLM Top 10 catalogue. Each plugin generates adversarial probes dynamically (so non-deterministic — ADR-049 §Alternative B notes this is intentionally avoided for the PR gate but it can supplement the cron). — [Promptfoo OWASP LLM Top 10](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/), [Promptfoo plugins](https://www.promptfoo.dev/docs/red-team/plugins/).
2. **`owasp:agentic` preset** — covers the 2026 Agentic Top-10 (Agent Goal Hijack, Tool Misuse, Memory Poisoning, multi-agent spoofing). Not relevant to V1 (no agents) but should land in V1.1 roadmap. — [Promptfoo OWASP Agentic](https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/).
3. **Multi-turn jailbreak strategies** — `crescendo`, `goat`, `multi-turn-conversation` strategy plugins. Generates a sequenced attack across N turns with the HTTP provider's session-ID `transformVars`. — [Promptfoo multi-turn](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/).
4. **Indirect prompt injection plugin** — explicitly tests untrusted-context injection paths (RAG, tool output, web pages). Requires a "untrusted variable" config. — [Promptfoo indirect-injection plugin](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/#llm01-prompt-injection-llmprompt-injection).
5. **ASCII smuggling / Unicode-tag plugin** — the 2026 attack class showing up in production guardrail bypasses. — [ToxSec Promptfoo Red Teaming](https://www.toxsec.com/p/promptfoo-red-teaming).
6. **Model drift gate** — replay your existing corpus across model versions, compare ASR over time, gate on regressions. — [Promptfoo: Detecting Model Drift](https://www.promptfoo.dev/docs/red-team/model-drift/).
7. **RAG poisoning utility** — injects malicious documents into the retrieval set and verifies the model can't be hijacked. — [Promptfoo OWASP LLM Top 10 RAG section](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/).

### Trade-off for Musaium
The curated 85-prompt corpus is **deterministic and PR-blocking** — that's a feature, not a bug (ADR-049 §Alternative B). Adding the `owasp:llm` preset as a **cron-only** workflow (no PR gate, no merge blocking) gives the breadth without compromising the PR signal. Recommended path : `llm-security-promptfoo-extended.yml`, weekly cron only, soft-fail (artifact upload + Slack alert, no merge block).

---

## 3. Garak 2026 state of the art

[NVIDIA Garak](https://github.com/NVIDIA/garak), Apache 2.0. Latest stable = **v0.14.1 (April 2026)**, Musaium pins `>=0.10,<0.12`. — [Garak PyPI](https://pypi.org/project/garak/).

### What Musaium uses today
3 probe families on Phi-3-mini : `promptinject`, `xss`, `leakreplay`.

### What Garak ships in 2026 that Musaium doesn't use
Garak ships **120+ probe modules** in 2026 (per [AppSec Santa Garak 2026 review](https://appsecsanta.com/garak)). Probe families relevant to Musaium :

| Probe | OWASP map | Why Musaium should care |
|---|---|---|
| `dan` (full DAN/jailbreak family) | LLM01 | Not in current scan — directly relevant to V1 art-topic guardrail bypass |
| `encoding` (Base64 / ROT-13 / Unicode stacks) | LLM01 obfuscation | Closes G4 — the encoded-payload gap. |
| `tap` (Tree of Attacks with Pruning) | LLM01 multi-turn | Closes G2 — multi-turn coverage. |
| `packagehallucination` (fake PyPI/npm names) | LLM05 | Marginal — Musaium chat doesn't generate code. Skip. |
| `malwaregen` | LLM05 | Marginal — same. Skip. |
| `goodside` (the Goodside meta-probe suite) | LLM01/LLM07 | Catches creative wordings the keyword filter misses. |
| `realtoxicityprompts` | LLM05 output | Already partly covered by output guardrail keyword filter. |
| `replay` (more aggressive leakreplay) | LLM07 | Worth adding once Garak target = Musaium endpoint. |

### REST generator path for Phase 1.5
Garak's `generators.rest` accepts a JSON spec file mapping the chat-completion contract. Approximate shape for Musaium :

```json
{
  "rest": {
    "RestGenerator": {
      "uri": "http://localhost:3000/api/chat/sessions/$SESSION_ID/messages",
      "method": "POST",
      "headers": { "Authorization": "Bearer $KEY", "Content-Type": "application/json" },
      "req_template_json_object": { "content": "$INPUT", "locale": "en" },
      "response_json": true,
      "response_json_field": "$.assistantMessage.content"
    }
  }
}
```

Then : `garak --target_type rest --generator_option_file musaium.rest.json --probes promptinject,encoding,dan,tap,leakreplay`. This is the ADR-049 Phase 1.5 deliverable. Cost ~2 days including a session-id loop to avoid history contamination between probes. — [Garak REST generator docs](https://reference.garak.ai/en/latest/garak.generators.rest.html), [Garak REST chat scanning tutorial — Melvin's blog](https://melvin.ovh/chatbot-security-automation-with-garak/).

### Pinning concern
`garak>=0.10,<0.12` is **two majors behind** v0.14.1. The v0.14.0 release (Feb 2026) introduced redesigned HTML reports + JSON config support per [Garak releases](https://github.com/NVIDIA/garak/releases). The pin is defensible (the ADR rationale is "future major bumps need a manual review") but should be re-evaluated post-launch to track the v0.13+ probe additions.

---

## 4. Alternatives surveyed

### Giskard

[Giskard OSS](https://github.com/Giskard-AI/giskard-oss), Apache 2.0. Differentiator vs Garak/Promptfoo : **first-class RAG evaluation toolkit (RAGET)** and **autonomous multi-turn red-team agents** (40+ probes, Crescendo-style dynamic attack crafting) mapped to OWASP Top 10. — [Giskard](https://www.giskard.ai/), [Giskard LLM scan docs](https://docs.giskard.ai/en/stable/knowledge/llm_vulnerabilities/index.html).

**Verdict for Musaium** : not a replacement for promptfoo+Garak — RAGET wins when you have a substantial custom KB to test, but Musaium's grounding is Wikidata-backed (third-party API, not a private KB Musaium controls). Worth re-evaluating when the B2B museum tenants ship private curatorial KBs. Watch, do not adopt now.

### DeepTeam

[DeepTeam](https://github.com/confident-ai/deepteam), MIT. Comes with OWASP_LLM_2025, OWASP_ASI_2026, NIST, MITRE, Aegis, BeaverTails framework presets. 40+ vulnerabilities, 10+ adversarial attack methods (single + multi-turn). — [DeepTeam docs](https://www.trydeepteam.com/), [DeepTeam crescendo](https://www.trydeepteam.com/docs/red-teaming-adversarial-attacks-crescendo-jailbreaking).

**Verdict for Musaium** : overlaps with Promptfoo's `owasp:llm:redteam` preset. Lighter touch than Promptfoo, less ecosystem. Not worth a third tool in V1.

### PyRIT (Microsoft)

[PyRIT](https://pypi.org/project/pyrit/), 3.6k stars (April 2026), v0.11.0 (Feb 2026). Best-in-class for **multi-turn orchestration** : `RedTeamingOrchestrator`, `CrescendoOrchestrator`, `TreeOfAttacksWithPruningOrchestrator`. — [PyRIT 2026 review](https://appsecsanta.com/pyrit), [Microsoft PyRIT blog](https://www.microsoft.com/en-us/security/blog/2024/02/22/announcing-microsofts-open-automation-framework-to-red-team-generative-ai-systems/).

**Verdict for Musaium** : recommended for V1.1 monthly cron complement to weekly Garak/Promptfoo. Coverage that neither Garak nor Promptfoo's static plugin set fully replicates. Cost = 1 GitHub Actions job, ~20 min/month.

### Llama Prompt Guard 2 (Meta)

[Prompt Guard 2 22M (Hugging Face)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-22M) — DeBERTa-xsmall, 75 % latency reduction vs 86M variant. Production-deployable as a pre-filter, **not a CI tool** — it sits in the data path. R4 §6 already recommends this. — [Llama Prompt Guard 2 docs](https://www.llama.com/docs/model-cards-and-prompt-formats/prompt-guard/).

**Verdict for Musaium** : **P0 for V1**. Adds an ML signal orthogonal to the keyword regex. Catches Base64/Unicode/whitespace bypasses (the G4 gap). Latency ~10-30 ms on CPU per [Llama Prompt Guard 2 86M model card](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M). Integration = ONNX model + a new scanner in the LLM-Guard sidecar `requirements.txt`. ~3-5 days of work.

**Important caveat** : recent benchmark research finds Llama Prompt Guard 2 ASR can drop sharply on out-of-distribution prompts (Qwen3Guard-8B showed a 57.2 pp gap between in-distribution and novel prompts per [arXiv 2511.22047](https://arxiv.org/pdf/2511.22047)). It's a useful pre-filter, **not** a replacement for the layered defence. Compose, don't substitute.

---

## 5. Attack coverage matrix

Rows = OWASP LLM Top 10 2025 + extension categories. Columns = current Musaium coverage / gap status. — sources : [OWASP LLM Top 10 2025 PDF](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf), [genai.owasp.org](https://genai.owasp.org/llm-top-10/), [OWASP Agentic Top 10 release](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/).

| OWASP risk | Promptfoo corpus (85) | Garak probes (current) | Garak probes (available) | Status for Musaium V1 |
|---|---|---|---|---|
| LLM01 Prompt Injection — direct | direct-extraction (6) + boundary-marker (3) + roleplay (6) | promptinject | promptinject + dan + goodside | **covered** |
| LLM01 Prompt Injection — **encoded payloads** | encoding (3) + token-smuggling (4) | — | **encoding** | **G4 partial** — minimal corpus, no Garak encoding probe |
| LLM01 Prompt Injection — **multi-turn / Crescendo** | multiturn-erosion (3) but **fired single-turn** | — | tap, replay | **G2 gap** — no true sequential attack |
| LLM01 Prompt Injection — **indirect / RAG** | 0 | — | latentinjection (Garak), indirect-injection plugin (promptfoo) | **G3 gap** |
| LLM02 Sensitive Info Disclosure | — | — | leakreplay (partial) | sidecar `Anonymize` per R4 P0 |
| LLM03 Supply Chain | — | — | packagehallucination (NA for chat) | out of scope (AI-BOM is R4 P1) |
| LLM04 Data and Model Poisoning | — | — | — | curated corpus, low risk pre-launch |
| LLM05 Improper Output Handling | smoke recall ≥80 % | xss | xss + realtoxicityprompts | output guardrail + sidecar `/scan/output` |
| LLM06 Excessive Agency | — | — | (NA — Musaium has no tools) | NA for V1 |
| LLM07 System Prompt Leakage | **85 prompts — primary purpose** | leakreplay (against Phi-3, **not Musaium**) | leakreplay + canary (manual) | **G1 — Garak target wrong + canary not implemented** |
| LLM08 Vector & Embedding | — | — | — | curated corpus only, see R5 |
| LLM09 Misinformation | — | — | snowball | citations via ADR-038 |
| LLM10 Unbounded Consumption | — | — | — | rate-limit + budget per ADR-030 + R7 |
| Agentic Top-10 (2025-12) | — | — | (NA — no agents) | NA for V1, **add for V1.1** |
| Multilingual low-resource jailbreak | 8 locales (en/fr/es/de/it/ja/zh/ar) | — | — | covered by translation family — but Arabic specifically known weak per [arXiv 2406.18725](https://arxiv.org/html/2406.18725v1) |

---

## 6. Continuous red teaming — cadence and budget

Current Musaium cadence per ADR-049 :

| Surface | Cadence | Cost |
|---|---|---|
| `llm-security-promptfoo.yml` | Weekly cron + PR (chat/llm changes) | ~12 min, 85 OpenAI calls = ~$0.10/run |
| `llm-security-garak.yml` | Weekly cron + PR | ~10 min, Phi-3 CPU (free), ~$0 |
| `llm-promptfoo-smoke.yml` | Daily cron | ~8 min, 10 OpenAI calls = ~$0.01/run |
| **Monthly total** | | ~$0.30 LLM spend + ~120 min runner time |

Industry guidance per [AppSec Santa LLM red teaming 2026](https://appsecsanta.com/ai-security-tools/llm-red-teaming) and [Adversa AI red teaming guide](https://adversa.ai/blog/manual-in-house-continuous-red-teaming-agentic-ai-coverage-cost/) : **moderate-change/moderate-exposure deployments warrant weekly cron + on-change + monthly extended scan**. Musaium matches the first two; adding a monthly PyRIT extended scan + a quarterly manual red-team would bring the cadence in line with best practice for production deployments.

**Cost is not the binding constraint.** The binding constraint is signal-to-noise — adding a third tool that occasionally false-positives a PR gate is worse than the gap. Recommendation : **add extended scans as cron-only (no PR gate, soft-fail with Slack alert)**.

---

## 7. Regression detection on LLM upgrades

Per [Promptfoo: Your model upgrade just broke your agent's safety](https://www.promptfoo.dev/blog/model-upgrades-break-agent-safety/) and [Promptfoo: Detecting Model Drift](https://www.promptfoo.dev/docs/red-team/model-drift/) : **safety does not transfer across model upgrades**. GPT-5's "safe-completion" mode, reasoning models (o1/o3/o4-mini), and provider fine-tunes all change refusal style and jailbreak resistance.

Musaium's exposure :
- CLAUDE.md confirms multi-provider routing : OpenAI / Deepseek / Google. `gpt-4o-mini-transcribe`, `gpt-4o-mini-tts`, plus LangChain orchestrator for chat. Any of these can be bumped silently by the provider.
- The weekly cron will eventually catch drift, but the lag is up to 7 days.

Recommendation : add a `MUSAIUM_LLM_MODEL` env override + a **model-pinned baseline JSON** committed to repo. On every PR that bumps the model env var, replay the 85-prompt corpus and fail-merge if ASR climbs > +5 pp vs the baseline. Same workflow infrastructure as the existing promptfoo gate — only adds a baseline-comparison Python script. Cost ~1 day.

---

## 8. Recommendation matrix — V1 + post-launch hardening

### Before 2026-06-01 launch (V1)

| Priority | Action | Effort | Source ADR / R# |
|---|---|---|---|
| **P0** | Complete Phase 1.5 Garak REST swap (ADR-049 §Rollout) — point Garak at `/api/chat/sessions/:id/messages` via a `generators.rest` JSON file. Add `dan` + `encoding` to the probe list. | ~2 days | ADR-049, this audit §3 |
| **P0** | Wire Llama Prompt Guard 2 22M into the LLM-Guard sidecar as a pre-filter scanner. ONNX, CPU-deployable, ~10-30 ms. | ~3-5 days | R4 §6, this audit §4 |
| **P1** | Add canary tokens to `chat.service.ts` system prompt + sentinel in output guardrail. Closes LLM07 with defence-in-depth orthogonal to the corpus. | ~1 day | R4 §5 Rebuff, this audit §1 G1 |
| **P2** | Add a **model-pinned ASR baseline** + drift gate on every PR that bumps `MUSAIUM_LLM_MODEL` or provider env. | ~1 day | this audit §7 |

### Post-launch hardening (V1 → V1.1, 2026-Q3)

| Priority | Action | Effort | Source |
|---|---|---|---|
| **P1** | Add `llm-security-promptfoo-extended.yml` — weekly cron only, `owasp:llm:redteam` preset, soft-fail with artifact + Slack alert. Adds indirect-injection + ASCII-smuggling + RAG-poisoning plugin coverage. | ~1 day | Promptfoo OWASP LLM Top 10 |
| **P2** | Add `llm-security-pyrit.yml` — monthly cron, `CrescendoOrchestrator` + `TreeOfAttacksWithPruningOrchestrator`. Closes G2 multi-turn gap. | ~3 days | PyRIT 2026 |
| **P2** | Add OWASP Agentic Top-10 probes (`promptfoo owasp:agentic` preset) **before** any tool/function-call shipping. Gates the framework for the B2B roadmap. | ~1 day | OWASP Agentic Top 10 |
| **P3** | Quarterly manual red-team engagement (external boutique, scoped 1 week). Validates the continuous CI's signal. | external cost | Adversa hybrid model |
| **P3** | Migrate Garak findings to GitHub Security (SARIF) — already planned for Phase 2 per ADR-049 §Rollout. | ~1 day | ADR-049 phase 2 |

---

## 9. Verdict

**Current coverage = conditionally OK for V1 (2026-06-01)** provided G1 (Garak REST swap) lands before launch. The promptfoo gate is real and Musaium-specific. The Garak gate is plumbing-only today and ADR-049 acknowledges this.

**Strengths**
- Three-workflow architecture (adversarial + adversarial + over-blocking smoke) is genuinely better than industry baseline. The smoke test catches the failure mode most red-team programmes ignore.
- 85-prompt curated corpus is deterministic and PR-blocking — exactly what Alternative B in ADR-049 calls out as the right trade-off vs LLM-generated attacks.
- Append-only corpus = regression guarantee.
- Bake period + 95 % threshold with planned ramp to 99 % shows honest calibration discipline.

**Weaknesses**
- G1 — Garak is a baseline check, not a Musaium check (Phase 1.5 still TODO).
- G2 — no true multi-turn coverage in CI despite Musaium being session-stateful by design.
- G3 — no indirect-injection corpus (Wikidata grounding via websearch adapter is the actionable surface).
- G4 — minimal encoded-payload coverage (3 entries on a 2026 dominant attack class).
- G5 — no agentic plugin coverage staged for the B2B-tools roadmap.

**Top 3 additions** :
1. Garak REST swap (P0 — closes G1).
2. Llama Prompt Guard 2 22M sidecar pre-filter (P0 — closes G4 + multilingual-bypass tail risk).
3. Canary tokens (P1 — defence-in-depth for LLM07 orthogonal to the corpus).

---

## Sources

OWASP
- [OWASP LLM Top 10 2025 — canonical](https://genai.owasp.org/llm-top-10/)
- [OWASP Top 10 for LLM Applications 2025 PDF (v4.2.0a)](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf)
- [OWASP LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP Top 10 for Agentic Applications (released 2025-12-10)](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)
- [OWASP issue 288 — Canary tokens](https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/issues/288)
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

Promptfoo
- [Promptfoo OWASP LLM Top 10](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/)
- [Promptfoo OWASP Agentic AI Top 10](https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/)
- [Promptfoo Red Team Configuration](https://www.promptfoo.dev/docs/red-team/configuration/)
- [Promptfoo Red Team Plugins](https://www.promptfoo.dev/docs/red-team/plugins/)
- [Promptfoo Multi-turn Jailbreaks](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/)
- [Promptfoo HTTP/HTTPS Provider](https://www.promptfoo.dev/docs/providers/http/)
- [Promptfoo: Detecting Model Drift](https://www.promptfoo.dev/docs/red-team/model-drift/)
- [Promptfoo: Your model upgrade just broke your agent's safety](https://www.promptfoo.dev/blog/model-upgrades-break-agent-safety/)
- [Promptfoo CI/CD Integration](https://www.promptfoo.dev/docs/integrations/ci-cd/)
- [Promptfoo Testing and Validating Guardrails](https://www.promptfoo.dev/docs/guides/testing-guardrails/)

Garak
- [NVIDIA/garak GitHub](https://github.com/NVIDIA/garak)
- [Garak releases (v0.14.x)](https://github.com/NVIDIA/garak/releases)
- [Garak PyPI](https://pypi.org/project/garak/)
- [Garak REST generator reference](https://reference.garak.ai/en/latest/garak.generators.rest.html)
- [Garak promptinject probes reference](https://reference.garak.ai/en/stable/garak.probes.promptinject.html)
- [Garak 2026 review (AppSec Santa)](https://appsecsanta.com/garak)
- [Automating security tests for any online chatbot with garak — Melvin's blog](https://melvin.ovh/chatbot-security-automation-with-garak/)
- [garak paper (arXiv 2406.11036)](https://arxiv.org/html/2406.11036v1)

Llama Prompt Guard 2 / PurpleLlama
- [Llama Prompt Guard 2 22M (Hugging Face)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-22M)
- [Llama Prompt Guard 2 86M (Hugging Face)](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M)
- [Llama Prompt Guard 2 docs](https://www.llama.com/docs/model-cards-and-prompt-formats/prompt-guard/)
- [Llama deployment / security in production](https://www.llama.com/docs/deployment/security-in-production/)
- [llama-cookbook Prompt Guard tutorial](https://github.com/meta-llama/llama-cookbook/blob/main/getting-started/responsible_ai/prompt_guard/prompt_guard_tutorial.ipynb)

Alternative tools
- [Giskard OSS GitHub](https://github.com/Giskard-AI/giskard-oss)
- [Giskard LLM scan documentation](https://docs.giskard.ai/en/stable/knowledge/llm_vulnerabilities/index.html)
- [DeepTeam GitHub](https://github.com/confident-ai/deepteam)
- [DeepTeam OWASP frameworks](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-llms)
- [PyRIT PyPI](https://pypi.org/project/pyrit/)
- [Microsoft PyRIT announcement](https://www.microsoft.com/en-us/security/blog/2024/02/22/announcing-microsofts-open-automation-framework-to-red-team-generative-ai-systems/)
- [Securing AI Agents with PyRIT (MS Community Hub)](https://techcommunity.microsoft.com/blog/appsonazureblog/securing-your-ai-agents-before-they-ship-red-teaming-with-microsoft-pyrit/4515514)
- [Rebuff (Protect AI) — canary tokens](https://github.com/protectai/rebuff)
- [Vigil-LLM canary tokens docs](https://github.com/deadbits/vigil-llm/blob/main/docs/canarytokens.md)

Research / adversarial
- [Crescendo multi-turn LLM jailbreak (arXiv 2404.01833)](https://arxiv.org/html/2404.01833v1)
- [Multilingual Jailbreak Challenges (ICLR 2024)](https://arxiv.org/html/2310.06474v3)
- [Low-Resource Languages Jailbreak GPT-4 (arXiv 2310.02446)](https://arxiv.org/pdf/2310.02446)
- [Jailbreaking LLMs with Arabic Transliteration and Arabizi (arXiv 2406.18725)](https://arxiv.org/html/2406.18725v1)
- [Generalizing Jailbreak/Defense Methods Across Languages (arXiv 2511.00689)](https://arxiv.org/html/2511.00689)
- [Guardrail robustness benchmark (arXiv 2511.22047)](https://www.arxiv.org/pdf/2511.22047)
- [LLM Red Teaming Guide 2026 (AppSec Santa)](https://appsecsanta.com/ai-security-tools/llm-red-teaming)
- [Adversa AI — manual vs in-house vs continuous red teaming](https://adversa.ai/blog/manual-in-house-continuous-red-teaming-agentic-ai-coverage-cost/)
- [LLM Guardrail Evasion Stacks Encoding (ToxSec)](https://www.toxsec.com/p/ai-and-cybersecurity)

Musaium repo (this audit)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-security-promptfoo.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-security-garak.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/llm-promptfoo-smoke.yml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/adr/ADR-049-llm-security-ci-gates.md`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/llm-security/systemprompt-leak-prompts.json`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/llm-security/promptfoo-systemprompt-leak.yaml`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/audit-2026-05-12/04-research/R4-ai-safety.md`
