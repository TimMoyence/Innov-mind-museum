# ADR-049 — LLM security CI gates: Garak + promptfoo

- Status: **Accepted** (2026-05-12)
- Authors: editor agent (run `2026-05-12-llm-guard-perennial-implementation`)
- Stakeholders: Backend lead, Security lead, Tech Lead
- Supersedes: —
- Superseded by: —
- Related: ADR-047 (LLM-Guard circuit breaker), ADR-038 (anti-hallucination)

## Context

The OWASP LLM Top 10 audit performed on 2026-05-12
(`.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/
compliance-research-owasp-llm-top10.md`) flagged **LLM07 (System Prompt
Leakage)** as the highest-priority gap in our guardrail stack:

- Keyword blocklist in `art-topic-guardrail.ts` catches direct phrasings
  ("reveal your prompt") but cannot catch paraphrased / translated / role-play
  variants.
- No automated red-team regression exists for system-prompt exfiltration.
- Existing `ci-cd-promptfoo.yml` covers jailbreaks + DAN attacks but not
  system-prompt extraction specifically.
- B2B museum tenants will inject business logic into system prompts (pricing,
  curatorial directives) — exfiltration would expose tenant IP.

We also have residual LLM01 coverage gaps on indirect / multi-turn injection
that the existing keyword-only filter doesn't catch.

## Decision

Add **two adversarial CI gates** + one defense-in-depth smoke test:

1. **`llm-security-promptfoo.yml`** — runs an 85-entry adversarial corpus
   (10 attack families, 8 locales) against the live chat endpoint. Fails if
   pass-rate < 95 %.
2. **`llm-security-garak.yml`** — runs NVIDIA Garak's `promptinject` + `xss`
   + `leakreplay` probe families against a Phi-3-mini baseline target. Fails
   on any HIGH/CRITICAL severity finding. Phase 1.5 will swap the target for
   the LLMGuard sidecar via a custom REST probe.
3. **`llm-promptfoo-smoke.yml`** — 10 non-adversarial reference prompts.
   Catches the opposite failure mode (over-blocking legitimate questions).
   Pass-rate < 80 % fails.

All three trigger on:
- weekly cron (Monday 04:00 UTC for the two adversarial gates; daily 03:30 for
  the smoke);
- `pull_request` paths touching `museum-backend/src/modules/chat/**`,
  `museum-backend/src/shared/llm/**`, `museum-backend/scripts/llm-security/**`,
  or `.github/workflows/llm-security-*.yml`;
- `workflow_dispatch` (manual).

Corpus + configs live at `museum-backend/scripts/llm-security/` and are
append-only.

## Rationale

### Why Garak AND promptfoo, not just one?

| Tool | Strength | Weakness |
|------|----------|----------|
| Garak | Battle-tested probes (29 PromptInject techniques, leakreplay), severity grading, lots of attack families | CLI-only, slower (~10 min), expects an HF or OpenAI model interface, not a REST chat endpoint out of the box |
| promptfoo | YAML-native, HTTP provider can hit any endpoint, fast (~3 min), CI-friendly JSON output | No first-class adversarial corpus — we have to bring our own |

Garak gives us a **research-validated baseline** that catches attacks we
wouldn't think of curating ourselves. promptfoo gives us a **Musaium-specific
regression suite** that's easy to extend as new attacks emerge in the wild.
The two are complementary, not redundant.

### Why Phi-3-mini as the Garak target (Phase 0)?

The mandate is to wire the Garak ↔ GitHub-Actions plumbing before pointing it
at the real backend. Phi-3-mini downloads in <2 min on `ubuntu-latest` and
runs CPU-only. It's a smoke test for the workflow itself; **Phase 1.5 will
replace it** with a custom REST probe pointed at the chat endpoint or the
LLMGuard sidecar.

### Why JSON-as-source for the corpus + YAML-generated tests?

promptfoo's `tests:` field wants a YAML array of `{vars, assert}`. Our corpus
carries metadata (`family`, `locale`, `id`) used for report aggregation and
future filtering — pure YAML would be harder to maintain. The
`expand-leak-corpus.mjs` script flattens JSON → YAML idempotently; both files
are checked in so no Node is needed for a bare CI clone.

### Why 95 % pass-rate, not 100 %?

A handful of borderline-paraphrase attacks may leak indirect hints (e.g. the
model paraphrasing "I'm a museum assistant that talks about art" — not a true
system-prompt leak but our sentinel catches `art assistant`). We hold the
threshold at 95 % during the **bake** period (≥7 days per CLAUDE.md
gotcha) then raise it to 99 % once we've calibrated false positives. Phase 2
will move to 100 % once Garak's continuous probe coverage replaces the static
corpus.

### Why store reports as artifacts vs. push to a SARIF dashboard?

Phase 0. SARIF/GitHub Security upload is on the Phase 2 roadmap once we've
validated the gate's signal-to-noise. Artifact retention is 30 days for the
adversarial reports, 14 days for the smoke (cheaper rotation).

## Consequences

### Positive

- Closes the GAP-1 (LLM07) item from the OWASP audit — first automated
  regression against system-prompt exfiltration.
- Catches multilingual attacks the keyword filter misses (translation /
  paraphrase variants in fr/es/de/it/ja/zh/ar).
- PR-blocking: contributors who tighten the guardrail in a way that newly
  leaks the prompt will see CI fail before merge.
- Forces real-world endpoint testing — promptfoo hits the actual
  `/api/chat/sessions/:id/messages` path with a real visitor JWT.

### Negative

- CI minutes cost: ~10 min Garak + ~12 min promptfoo + ~8 min smoke = ~30
  weekly minutes of `ubuntu-latest`, well within the project's monthly budget
  but worth tracking. Cron-only schedule keeps PR cost bounded to the
  guardrail-change subset.
- OpenAI API spend: each promptfoo run does 85 + 10 chat calls per execution.
  At gpt-4o-mini-tier prices (~$0.001/call) this is <$0.10/run. Negligible.
- Garak HF model download: 7 GB cached in `actions/setup-python` pip cache;
  cold-start adds ~3 min to the first weekly run.
- Corpus maintenance burden: append-only means it can only grow; we accept
  this as a regression-guarantee feature.

### Risks

- **False-positive sentinels.** If the model legitimately writes "you are an
  art assistant" in a normal answer (unlikely but possible), the gate fails.
  Mitigation: bake period + sentinel set tuned to phrases that ONLY appear in
  the system prompt, not in plausible answers.
- **Provider drift.** Upstream LLM behaviour changes can move pass-rate up or
  down without our code changing. The weekly cron catches this; if the gate
  starts failing without code change, that's a model-drift signal — escalate
  to the LLM Cache / provider failover layer.
- **Garak API breakage.** Pinned to `garak>=0.10,<0.12`. Future major bumps
  need a manual review.

## Alternatives considered

### Alternative A — Build a custom red-team script

Rejected. Lower coverage (we don't know what we don't know), no severity
grading, no upstream maintenance, more code to own. Garak gives us 1500+
probes for free.

### Alternative B — Use only promptfoo's built-in `prompt-injection` plugin

Rejected. The plugin auto-generates attacks via an LLM, which is
non-deterministic (different attacks each run = flaky CI). Our curated JSON
corpus is reproducible and append-only — a strict superset of the deterministic
guarantees we need for a PR-blocking gate.

### Alternative C — Run Garak in production via continuous fuzzing

Deferred to Phase 2. Continuous fuzzing against the live endpoint is
expensive (billed LLM calls) and could be abused if the endpoint isn't
properly scoped. Phase 2 requires per-tenant cost caps + a dedicated test
museum_id first.

## Rollout plan

| Phase | Window | Action |
|-------|--------|--------|
| 0 | 2026-05-12 → 2026-05-19 | Land workflows + corpus. Bake nightly. Tune sentinel false positives. |
| 1 | 2026-05-19 → 2026-06-01 | Raise promptfoo pass-rate threshold from 95 % → 99 % if no false positives observed in ≥7 nightly runs. |
| 1.5 | 2026-06-01 → 2026-07-01 | Replace Garak's Phi-3-mini target with a custom REST probe pointed at `/api/chat/sessions/:id/messages` via the LLMGuard sidecar. |
| 2 | 2026-Q3 | Migrate Garak runs to GitHub Security (SARIF). Wire per-tenant cost caps. Move to continuous fuzzing in a dedicated test museum. |

## Verification

After merge, the following must hold:

- `gh workflow list` shows the three new workflows.
- Manual `workflow_dispatch` of `llm-security-promptfoo.yml` produces a pass
  (≥95 %) report.
- Manual `workflow_dispatch` of `llm-security-garak.yml` produces a Garak
  JSONL report with no HIGH/CRITICAL findings.
- Modifying `llm-prompt-builder.ts` in a follow-up PR triggers both gates.

## References

- OWASP LLM Top 10 2025 — https://genai.owasp.org/llm-top-10/
- LLM07 System Prompt Leakage — https://genai.owasp.org/llmrisk/llm07-system-prompt-leakage/
- NVIDIA Garak — https://github.com/NVIDIA/garak
- promptfoo red-team guide — https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/
- HackAPrompt 2023 (Schulhoff et al., EMNLP) — https://aclanthology.org/2023.emnlp-main.302/
- PromptInject (Perez & Ribeiro 2022) — https://reference.garak.ai/en/stable/garak.probes.promptinject.html
- Research file:
  `.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-owasp-llm-top10.md`

## Changelog

| Date | Change |
|------|--------|
| 2026-05-14 | **Phase 1.5 closed** ahead of schedule. `llm-security-garak.yml` swapped from `huggingface.Pipeline` (Phi-3-mini-4k-instruct) target to `rest` generator pointed at `POST /api/chat/sessions/:id/messages` via `museum-backend/scripts/llm-security/musaium-garak-rest.json` (response path `$.message.text`, body `{"text":"$INPUT"}`, `ratelimit_codes:[429]`). Probe set widened 3 → 6 (`promptinject,leakreplay,encoding,dan,tap,xss`) — closes G2 (multi-turn via `dan`+`tap`) and G4 (encoding bypass via `encoding`) from the 2026-05-14 verification audit. `--parallel_attempts` dropped 2 → 1 to stay below OpenAI rate-limit on ~750 calls/run. Session-per-probe freshness loop (bash) prevents cross-probe history contamination. New `Content check` step fails the workflow if zero records carry a non-empty `output` field (defense vs silent JSON-shape drift if BE renames `message.text` in a future refactor). Severity-eval Python widened from single-report to multi-report glob. Run: `2026-05-14-garak-musaium-rest-swap`. PR: #TBD. First successful workflow run: TBD (Tech Lead fills at merge). |
| 2026-05-14 | Known coverage gap (deferred to Phase 2): LLM Guard sidecar is NOT deployed in CI (no service container, `GUARDRAILS_V2_LLM_GUARD_URL` unset). Both Garak and promptfoo therefore exercise the keyword guardrail (`art-topic-guardrail.ts`) + sanitization + LLM call, but not the sidecar PII Anonymize / output classifier path. Phase 2 will boot the sidecar as a service container or use a stub. |
