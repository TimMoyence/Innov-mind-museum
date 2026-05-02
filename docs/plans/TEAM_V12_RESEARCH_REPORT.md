# /team v12 — Research Report & Upgrade Plan

**Date:** 2026-05-01
**Status:** Draft — pending decisions D1-D6 (see §10)
**Scope:** Cross-research on 4 axes (AI dev practices, multi-agent orchestration, AI security, velocity tooling) → consolidated upgrade plan for `/team` skill (currently v11) and broader Musaium AI-dev stack.
**Constraints:** KISS / DRY / Clean Architecture (hexagonal). Enterprise-grade. Solo-to-small team velocity.

---

## 1. TL;DR — 10 Decisions

1. ★ **Restrict parallelism to READ-ONLY tasks** (audit, research, investigation). Serialize ALL writes. Cognition + Anthropic + LangGraph converge on this.
2. ★ **Spec-driven development** as default flow: `/specify` → `/plan` → `/tasks` → implement. GitHub Spec Kit / BMAD pattern. Markdown stories = single source of truth.
3. ★ **Architect/Editor split** — Opus 4.7 for plan, Opus 4.6 for edits.
   > **Update 2026-05-02 (UFR-010 override):** Original Aider pattern uses Sonnet for the editor; Musaium overrides to **all-Opus** per UFR-010 ("operational excellence over token savings"). Architect=Opus 4.7, Editor=Opus 4.6. Cost report estimate ("-30% / 3× cheaper") in §7 W4 NO LONGER APPLIES — expected cost is approximately neutral vs v4. Real savings come from cache warm-up sequencing (V12 §6) + handoff-brief shrinkage (≤200 tokens vs full-history repeat) + APC plan reuse, NOT from editor model swap.
4. ★ **Deterministic hooks > critic agents** for lint/typecheck/tests. Reserve LLM critique for semantics, security, scope.
5. ★ **Verification-before-completion mandatory** (superpowers skill already installed). MAST 2025: 21.3% multi-agent failures = skipped verification.
6. ★ **Durable file-based state** — `.claude/skills/team/state/<run-id>/state.json` + `STORY.md`. Resume after crash via `/team resume <run-id>`.
7. **Prompt-Guard-2-86M (local) + Lakera Guard (optional SaaS)** before existing keyword filter. Indirect injection = top 2025 vector.
8. **promptfoo + garak in CI** — jailbreak corpus + DAN/PAIR/encoding probes. Block PR on regression.
9. **Langfuse self-host** = observability #1. Measure tokens/latency/error per agent before optimizing.
10. **Stryker mutation + fast-check property** = anti-hallucination test defense (kills `expect(true).toBe(true)`).

---

## 2. /team v12 — Architecture

### Target structure

```
.claude/skills/team/
├── team-dispatcher.md          # 143L → ~180L (state mgmt + cache warm)
├── team-protocols/             # 7 protocols preserved, augmented
├── team-templates/             # NEW — Spec Kit
│   ├── spec.md.tmpl            # EARS-format requirements
│   ├── design.md.tmpl          # arch decisions
│   └── tasks.md.tmpl           # atomic task list
├── team-agents/                # 9 → 5-6 (consolidation, see §3)
├── team-knowledge/             # JSON KB w/ cache_control: ephemeral
├── team-hooks/                 # NEW — deterministic gates
│   ├── post-edit-lint.sh
│   ├── post-edit-typecheck.sh
│   └── pre-complete-verify.sh
└── state/                      # NEW — durable runs
    └── <YYYY-MM-DD-slug>/
        ├── state.json          # {version, protocol, currentStep, briefs[], gates[]}
        ├── STORY.md            # append-only sections per agent
        └── handoffs/           # ≤200-token briefs between agents
```

### Protocol changes

| Protocol | v12 change |
|---|---|
| brainstorm | Output = `spec.md` EARS-format (mandatory) |
| plan | Output = `design.md` + `tasks.md`. Architect agent (Opus) only. |
| implement | Editor agent (Sonnet). PostToolUse hooks lint/tsc mandatory. |
| review | Critic agent fresh context (never reviews own work). + CodeRabbit PR pass. |
| test | Stryker mutation gate ≥70% on critical modules. fast-check on guardrails. |
| security | promptfoo eval blocking. Output classifier (Presidio NER). Audit log row hash-chained. |
| deploy | Cosign verify + SLSA L3 metadata. |

### Key schemas

**Handoff brief** (≤200 tokens, JSON):
```json
{
  "from": "architect",
  "to": "editor",
  "task": "implement F4 backend",
  "context_refs": ["src/modules/auth/...", "docs/adr/ADR-013.md"],
  "decisions": ["use repository port", "fail-closed on Redis down"],
  "blockers": []
}
```

**state.json — optimistic lock** (version increment, reject stale writes).

**Resume contract** — `/team resume <run-id>` reads `state.json`, jumps to `currentStep`. LangGraph thread-id equivalent.

---

## 3. Agent consolidation 9 → 5-6

CrewAI evidence + Cognition warning: 3-5 roles outperform 9+ in SWE tasks.

| Keep | Merge / Delete |
|---|---|
| **Architect** (plan, Opus) | brainstormer + planner → architect |
| **Editor** (implement, Sonnet) | implementer renamed |
| **Verifier** (build/test/lint/`gitnexus_detect_changes`) | spot-check + viability + verifier merged |
| **Security** (read-only + Grep + promptfoo) | security agent kept |
| **Reviewer** (fresh context, semantic) | reviewer kept |
| **Documenter** (ADR + STORY.md sync) | optional — only if doc load high |

### Tool restrictions per role (Claude Agent SDK `allowedTools`)

| Agent | allowedTools |
|---|---|
| security | `Read, Grep, Bash(promptfoo*, garak*, semgrep*)` — no Edit |
| verifier | `Bash(pnpm*, tsc*, npm test*), Read` — no Edit |
| editor | `Edit, Write, Read, Bash(pnpm test*, pnpm lint*)` — no deploy |
| architect | `Read, Grep, mcp__gitnexus__*, Write(plan files only)` |
| reviewer | `Read, Grep, mcp__gitnexus__*` — no Edit |

---

## 4. Security stack — additions (prioritized)

| Priority | Tool | Coverage | Effort |
|---|---|---|---|
| P0 | **Prompt-Guard-2-86M** local (HF) | OWASP LLM01 direct injection | 1d (CPU sidecar) |
| P0 | **Indirect injection wrapper** `<untrusted_content>` XML tags | OCR / Brave / Wikidata results | 0.5d |
| P0 | **Microsoft Presidio NER** on LLM **output** | LLM02 PII leak | 1d |
| P0 | **promptfoo CI gate** (jailbreak corpus) | Regression on chat.service.ts changes | 0.5d |
| P1 | **Lakera Guard SaaS** (if budget) | LLM01 ML classifier production-grade | 0.5d |
| P1 | **NVIDIA garak nightly** | DAN / PAIR / encoding probes | 1d |
| P1 | **`audit_log` table** hash-chained | Tamper-evident agent calls | 1d |
| P1 | **Renovate `rangeStrategy: pin`** for LangChain/LangGraph | LLM03 supply chain (3 CVEs in 2024-2025) | 0.5d |
| P2 | **Cosign + SLSA L3** | Image integrity | 1d |
| P2 | **Socket.dev PR bot** | Dep risk scoring | 0.5d |
| P2 | **Semgrep `p/llm-security` ruleset** | LangChain anti-patterns | 0.5d |

### CI workflow `ci-cd-llm-guard.yml` augmented

```yaml
jobs:
  promptfoo:        # PR-blocking — jailbreak corpus vs staging API
  presidio-output:  # synthetic chat → assert no PII leak
  semgrep-llm:      # p/llm-security + p/owasp-top-ten
  socket-deps:      # PR comment on AI dep risk
  garak:            # nightly cron — probes=dan,promptinject,encoding
  cosign-verify:    # before deploy
```

### Audit log schema (hash-chained)

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL,
  user_id UUID,
  prompt_hash TEXT NOT NULL,
  tools_called TEXT[] NOT NULL,
  tool_inputs_hash TEXT NOT NULL,
  tool_outputs_hash TEXT NOT NULL,
  response_hash TEXT NOT NULL,
  classifier_scores JSONB,
  ts TIMESTAMPTZ DEFAULT now(),
  prev_row_hash TEXT,           -- chain over previous row
  row_hash TEXT NOT NULL        -- sha256(prev_row_hash || other fields)
);
```

---

## 5. Velocity tooling — shortlist

Current stack (GitNexus + Repomix + Serena + superpowers + /team) is top 5%. Don't replace. Add:

| Add | ROI | Setup |
|---|---|---|
| **Langfuse self-host** | 10× — agent telemetry | docker-compose 1h |
| **ast-grep** | 8× — kills 80% of codemods | `npm i -g`, 3 starter rules |
| **Stryker mutation** | 7× — kills false-green tests | 1d on chat + auth modules |
| **fast-check property** | 6× — guardrail math | 1d on sanitizer + rate-limit |
| **CodeRabbit** (single bot) | 5× — PR pre-pass | 1-month trial |
| **openapi-diff CI** | 5× — block breaking changes | 1h |
| **Playwright snapshot** (museum-web) | 4× | already installed |
| **Structurizr DSL C4** | 3× — arch-as-code, feed Claude | ADR companion |
| **Anthropic Memory Tool** (beta) | 3× — persistent learnings | wrap existing KB |
| **awesome-claude-code mining** | 2× | 1h/week |

### Skip

LangSmith (vendor lock), Pact (OpenAPI contract tests already cover), Cursor Composer specs (IDE lock-in), BMAD/claude-flow as orchestrator (conflicts with /team), Greptile + Bito stacked review bots (one bot max).

---

## 6. LLM-coding patterns to adopt

### XML structured prompts (Anthropic-trained boost)

All v12 agent prompts:

```xml
<role>...</role>
<context>...</context>
<task>...</task>
<constraints>KISS, DRY, clean-arch, no eslint-disable without reason</constraints>
<output_format>...</output_format>
<examples>...</examples>
```

### Prompt caching warm-up (CRITICAL)

- `cache_control: ephemeral` markers on dispatcher (143L) and JSON KB.
- Opus 4.7 minimum 4096 tokens.
- **Always single warm call before parallel fan-out.** Redis blog: 5-10× cost blow-up otherwise.

### Agentic Plan Caching (APC)

Index plan templates by task fingerprint. Reuse = -50% cost, -27% latency (arxiv 2506.14852). Natural fit for existing JSON KB.

---

## 7. Roadmap — 8 weeks

| Wk | Action | Exit gate |
|---|---|---|
| W1 | Langfuse docker + OTel wrapper around /team agents + LangChain orchestrator. Baseline measurement. | Live dashboard tokens/latency |
| W2 | /team v12 dispatcher + state.json + STORY.md template. Pilot migration of 1 protocol. | Resume `<run-id>` works |
| W3 | Agent consolidation 9→6. Strict allowedTools. Deterministic hooks (lint/tsc). | All protocols migrated |
| W4 | Architect/Editor split (Opus 4.7 / Opus 4.6, all-Opus per UFR-010). Cache warm-up sequencing. | Cost report measured (no -30% target — neutral vs v4 expected; savings come from cache warm-up + handoff brief shrinkage + APC) |
| W5 | Prompt-Guard-2 + indirect injection wrapper + Presidio output + promptfoo CI. | OWASP LLM01/02 covered |
| W6 | Stryker on chat + auth + fast-check on guardrails + openapi-diff. | Mutation score ≥70% |
| W7 | ast-grep codemods + Spec Kit templates (`spec.md` EARS). | 3 codemods + 1 spec pilot |
| W8 | Cosign + SLSA L3 + audit_log + Renovate pin + skill mining. | Signed deploy end-to-end |

---

## 8. Anti-patterns (DO NOT)

- Split editing tasks across parallel agents (context collapse — Cognition).
- Parallel calls before cache warm (5-10× billing).
- Reviewer on its own context (rubber stamp).
- Group chat free-form (token burn, non-deterministic). Use explicit handoffs.
- More than 5 parallel sub-agents (synthesis cost > savings).
- Mid-protocol human interrupts (Devin: leads to abandonment).
- In-memory-only state (crash = full re-run).
- Verifier-corrector loops without budget (cap 2 iterations, then escalate replan).
- Critic agents for lint/types/tests (code does it, free).
- Regex-only PII + denylist-only guardrail (trivial bypass).
- LangChain `^x.y` pin (breaking sec patches in minor releases).
- `dangerouslySetInnerHTML` on LLM markdown without DOMPurify.
- Stack 5 review bots (noise + contradiction + $80/u).
- Context-stuffing 200k tokens (degrades reasoning).
- Replace Repomix without measuring (lateral move).
- BMAD / claude-flow on top of /team (prompt drift conflict).
- Wikidata / Brave concat raw into system prompt (indirect injection vector).
- `[END OF SYSTEM INSTRUCTIONS]` boundary marker alone (necessary, not sufficient).
- Skipping mutation testing (AI loves `expect(true).toBe(true)`).

---

## 9. KISS / DRY / Clean Architecture compliance

| Principle | v12 application |
|---|---|
| **KISS** | 9→6 agents. Deterministic hooks instead of critic agents. Single state file vs DB. Spec Kit templates simple markdown. |
| **DRY** | Cached JSON KB (`cache_control`). Handoff briefs ≤200 tokens (no full-history repeat). APC plan template reuse. Single Spec Kit format across protocols. Shared test factories already enforced (CLAUDE.md). |
| **Clean Architecture** | Agent role = port. `allowedTools` = adapter capability constraint. `state.json` = aggregate root. Hooks = domain events. Maps directly onto existing hexagonal backend. |

---

## 10. Open decisions

| # | Question | Recommendation |
|---|---|---|
| D1 | Consolidate 9→6 agents? | YES — Cognition + CrewAI evidence converge |
| D2 | Lakera Guard SaaS or Prompt-Guard-2 local only? | Local first; Lakera if traffic >10k req/d |
| D3 | CodeRabbit 1-month trial? | YES — A/B vs human-only review |
| D4 | 8-week roadmap as-is or compress? | 8 weeks realistic for solo; compression = debt risk |
| D5 | Backup `/team` v11 on branch `team-v11-archive` before migration? | YES — mandatory rollback path |
| D6 | Save this report as `docs/plans/TEAM_V12_RESEARCH_REPORT.md`? | DONE — this file |

---

## 11. Key sources

- Cognition Labs — *Don't Build Multi-Agents*: https://cognition.ai/blog/dont-build-multi-agents
- Anthropic — *Multi-Agent Research System*: https://www.anthropic.com/engineering/multi-agent-research-system
- MAST taxonomy paper (NeurIPS 2025): https://arxiv.org/abs/2503.13657
- GitHub Spec Kit: https://github.com/github/spec-kit
- AWS Kiro: https://kiro.dev/
- BMAD-METHOD: https://github.com/bmad-code-org/BMAD-METHOD
- Aider Architect Mode: https://aider.chat/2024/09/26/architect.html
- LangGraph multi-agent: https://langchain-ai.github.io/langgraph/concepts/multi_agent/
- Claude Agent SDK: https://docs.anthropic.com/en/api/agent-sdk/overview
- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/
- OWASP LLM Top 10 2025: https://genai.owasp.org/llm-top-10
- OWASP Agentic AI Threats: https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations
- MITRE ATLAS: https://atlas.mitre.org
- NIST AI 600-1: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- Anthropic Prompt Caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic Memory Tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- Agentic Plan Caching: https://arxiv.org/abs/2506.14852
- Langfuse: https://langfuse.com
- ast-grep: https://ast-grep.github.io
- Stryker Mutator: https://stryker-mutator.io
- fast-check: https://fast-check.dev
- promptfoo: https://www.promptfoo.dev
- NVIDIA garak: https://github.com/NVIDIA/garak
- Microsoft Presidio: https://microsoft.github.io/presidio
- Meta Prompt-Guard-2-86M: https://huggingface.co/meta-llama/Prompt-Guard-2-86M
- Lakera Guard: https://www.lakera.ai/lakera-guard
- Sigstore Cosign: https://www.sigstore.dev
- SLSA L3: https://slsa.dev/spec/v1.0/levels#build-l3
- awesome-claude-code: https://github.com/hesreallyhim/awesome-claude-code

---

**Next step:** await decisions D1-D5, then write detailed W1 plan (`docs/plans/TEAM_V12_W1_LANGFUSE.md`) covering Langfuse docker setup, OTel GenAI semconv wrapper, baseline metrics dashboard, and rollback path.
