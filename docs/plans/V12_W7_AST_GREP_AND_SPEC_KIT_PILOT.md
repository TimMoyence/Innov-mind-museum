# V12 W7 — ast-grep codemods + Spec Kit production pilot

**Status:** ast-grep config + 3 starter rules shipped. Spec Kit production-pilot guidance below — first real `/team` v12 run is the validation.

---

## 1. ast-grep — what shipped (this commit)

- `sgconfig.yml` (repo root) — ast-grep workspace config pointing at `tools/ast-grep-rules/`.
- `tools/ast-grep-rules/no-raw-throw-error.yml` — `throw new Error(...)` outside domain/migrations → use AppError factories.
- `tools/ast-grep-rules/no-dangerously-set-inner-html-without-purify.yml` — DOMPurify-or-fail (V12 §8, OWASP LLM02).
- `tools/ast-grep-rules/no-unicode-emoji-in-screen.yml` — unicode emoji forbidden in screens (`feedback_no_unicode_emoji`).
- `tools/ast-grep-rules/README.md` — install + run + add-rule + CI integration guide.

Local install: `brew install ast-grep` or `npm install -g @ast-grep/cli`. Run: `ast-grep scan`.

CI integration (`.github/workflows/ci-cd-ast-grep.yml`) — deferred. Documented in `tools/ast-grep-rules/README.md`. Add when there's appetite for another required check.

---

## 2. Spec Kit production pilot

W2 already shipped the templates and dispatcher. W7 closes the loop by running the first **real** `/team` v12 feature through the pipeline.

### 2.1 Pick the pilot

Criteria for the first pilot:
- **Bounded scope** — single module, ≤10 files, no cross-app changes (so the architect/editor split has obvious value without explosion).
- **Quiet area** — chat module currently active in another session; pick something else (auth, museum, support, review).
- **Real value** — not a throwaway "hello world"; a backlog item the user actually wants.

Suggested first pilots (any one — user's call):
- `auth.refresh-token-rate-limit-tightening` — narrow F1 contract from 30 req/min to 20 req/min, regenerate tests.
- `support.ticket-archive-endpoint` — add `POST /api/support/tickets/:id/archive` with role gate.
- `museum.geo-distance-cache-ttl-extension` — extend in-museum cache from 20min to 30min, add metric.

### 2.2 Run protocol

```bash
# 1. Init the run
RUN_ID=$(date +%Y-%m-%d)-pilot-auth-rate-limit
mkdir -p .claude/skills/team/team-state/$RUN_ID/handoffs
cp .claude/skills/team/team-templates/STORY.md.tmpl .claude/skills/team/team-state/$RUN_ID/STORY.md

# 2. Capture start commit + write initial state.json
START_COMMIT=$(git rev-parse HEAD)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > .claude/skills/team/team-state/$RUN_ID/state.json <<EOF
{
  "runId": "$RUN_ID",
  "version": 1,
  "createdAt": "$TS",
  "updatedAt": "$TS",
  "mode": "feature",
  "pipeline": "standard",
  "currentStep": "brainstorm",
  "status": "initializing",
  "startCommit": "$START_COMMIT"
}
EOF

# 3. Invoke /team
/team feature "tighten F1 contract refresh-token rate-limit from 30 to 20 req/min"
```

The dispatcher (SKILL.md v12 Step 0) should:
1. Detect that `$1` doesn't match `^resume:` → INIT mode.
2. Verify state.json structure matches schema.
3. Spawn architect (Opus 4.7) with full mandate per `team-protocols/agent-mandate.md`.
4. Architect produces `spec.md` → `design.md` → `tasks.md` + `001-architect-to-editor.json` brief.
5. Spawn editor (Opus 4.6) with brief.
6. Editor edits → `post-edit-lint.sh` + `post-edit-typecheck.sh` per task.
7. Spawn verifier (Opus 4.6) → `pre-complete-verify.sh`.
8. Spawn reviewer (Opus 4.7, fresh context).
9. Tech Lead `git add` + commit.

### 2.3 Pilot success criteria

- [ ] State.json passes JSON schema validation throughout the run.
- [ ] All 4 phases (brainstorm/plan/implement/verify/review) appended sections to STORY.md without rewriting prior sections (sha256 chain holds).
- [ ] At least 1 handoff brief stays ≤200 tokens (`post-edit-lint.sh` gate green).
- [ ] post-edit-lint + post-edit-typecheck PASS on first try OR within ≤2 corrective loops.
- [ ] pre-complete-verify PASS (scoped tests + STORY.md sha256).
- [ ] Reviewer fresh-context — no transcript pollution from editor's session.
- [ ] Total wall-clock < 30 min for a 5-file change.
- [ ] Langfuse spans (when LANGFUSE_ENABLED=true) show one span per agent dispatch.

### 2.4 Failure modes to watch + mitigations

| Failure | Mitigation |
|---|---|
| Architect produces vague spec.md (no measurable acceptance) | Reviewer flags as BLOCK; rerun architect with stricter mandate referencing EARS examples |
| Editor exceeds 2 corrective loops on lint | Cap → escalade to user. Either fix template / mandate or accept that this scope was too tangled for v12 |
| Handoff brief > 200 tokens | post-edit-lint FAIL — architect re-trims via context_refs > inline content |
| STORY.md hash mismatch | pre-complete-verify FAIL — editor or other agent rewrote a prior phase. Investigate which agent + tighten prompt |
| Reviewer rubber-stamps (no findings) | UFR-013 sycophancy — score reviewer ROI down, escalate user awareness |

### 2.5 Telemetry checkpoint

If Langfuse is set up (W1 plan), capture for the pilot run:
- tokens_in / tokens_out per agent
- elapsed_ms per phase
- cost_usd_estimate total
- corrective_loops count

Compare to a v4 baseline run for the same scope (if archived). Expectation per V12 §1.3 cost banner: cost neutral vs v4, savings come from cache warm-up + handoff brief shrinkage + APC plan reuse.

### 2.6 After the pilot

If success criteria met → V12 graduates from "shipped" to "production default". Document in `team-sdlc-index.md` changelog with the run ID + Langfuse trace URL.

If failure → root-cause analysis written to `team-state/<run-id>/STORY.md` finalize section. Iterate dispatcher / templates / mandate. Repeat pilot.

---

## 3. Acceptance gate (W7 done)

- [x] ast-grep config + 3 starter rules + README shipped.
- [ ] First real `/team` v12 pilot run completed with success criteria met (manual — requires user-initiated `/team feature`).
- [ ] CI workflow `ci-cd-ast-grep.yml` activated (deferred until pilot validates v12 process).

User runs the pilot at their convenience; no further code change blocks W7 closure on the dev side.
