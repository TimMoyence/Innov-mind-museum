# GDPR Article 22 — Scope analysis for Musaium AI guardrails

> **Status:** Live document — Phase 0 fold-in 2026-05-12.
> **Author:** founder/tech lead.
> **Related:** `docs/AI_SAFETY.md`, `docs/legal/DPIA.md`, `docs/legal/ROPA.md`, `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`.
> **Source research:** `.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-audit-log-patterns.md` §B.

---

## TL;DR

**GDPR Article 22 does NOT apply to Musaium's current AI guardrails.** Chat refusals are advisory, not legally significant decisions. The user can re-prompt at any time, no account suspension is automated, no contract is denied, no service is gated by the guardrail verdict. The decision is **purely conversational**.

However, **two future workflow changes would activate Art. 22** and require us to ship the right-to-explanation endpoint (`GET /api/chat/messages/:id/explanation`) + recourse path + human-review evidence. These triggers are documented below.

## Legal basis

### Article 22 GDPR — verbatim

> The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her.

### Recital 71 — verbatim (excerpt)

> The data subject should have the right not to be subject to a decision, which may include a measure, evaluating personal aspects relating to him or her which is based solely on automated processing and which produces legal effects concerning him or her or similarly significantly affects him or her ...

### The two elements

A decision triggers Art. 22 **only if** it satisfies **both** conditions:

1. **"Solely on automated processing"** — no meaningful human review in the decision path.
2. **"Legal effects" or "similarly significant effects"** — examples cited by the EDPB (Guidelines WP251) include automatic refusal of an online credit application or e-recruiting practices without human intervention. Conversational refusal that the user can immediately retry is **not** in this category.

## Why Musaium guardrails do NOT satisfy condition 2

| Guardrail outcome | Effect on user | Art. 22 trigger? |
|---|---|---|
| Input blocked (`art-topic-guardrail`, keyword) | User sees a localised "off-topic" refusal. Can re-phrase + re-submit immediately. | **No** — advisory, retriable |
| Input blocked (`LLMGuardAdapter`, sidecar) | User sees a localised "unsafe content / service unavailable" refusal. Can re-phrase + re-submit. | **No** — advisory, retriable |
| Output blocked (LLM judge) | User sees a localised "I cannot answer this" refusal. Can re-phrase the question. | **No** — advisory, retriable |
| Session ended | The chat session is *closed*; user can start a new session immediately at no cost. | **No** — no account / service consequence |

None of these decisions produces a "legal effect" (no contract refused, no service denied, no monetary penalty, no record kept against the user that survives the session) or a "similarly significant effect" (no impact on access to fundamental services, employment, credit, healthcare, etc.).

## The CJEU SCHUFA escalation — when Art. 22 WOULD apply

CJEU C-634/21 SCHUFA (7 December 2023) clarified that Art. 22 applies even when a human *signs* the decision, **if that human does not exercise meaningful independent judgement** — e.g. rubber-stamping an algorithmic credit score. The Court held that the "scoring" itself is the automated decision under Art. 22 when third parties (banks) rely on it without meaningful re-evaluation.

**Trigger for Musaium:** if a future workflow ever has a Musaium admin/operator **act on guardrail flags without meaningful review** — for example:

- An admin bans / suspends a user account based solely on the count of guardrail blocks attributed to that user.
- An admin issues content warnings to a user based on an automated flag without inspecting context.
- A B2B museum customer requires us to attribute "problematic visitor" labels back to them based on guardrail flags.

In every such case, the **automated guardrail decision** (not the admin click-through) becomes the Art. 22 decision, and we must:

1. Provide the data subject with **meaningful information about the logic involved** (Art. 13(2)(f) + Art. 15(1)(h)) → ship `GET /api/chat/messages/:id/explanation`.
2. Provide a path for the data subject to **express their point of view, obtain an explanation, and contest the decision** (Art. 22(3)) → ship recourse UI ("Signaler" button is a start; needs to escalate to human review).
3. Implement **meaningful human review** (not rubber-stamping) → document the human-review SOP, training, audit log of the human review step.
4. Update `docs/legal/DPIA.md` + `docs/legal/ROPA.md`.

## Current implementation

- **Endpoint** `GET /api/chat/messages/:id/explanation`: **NOT YET SHIPPED**. Pre-emptively scheduled for Phase 1 (post-launch) as a best-practice anchor — covers AI Act Art. 14 spirit and future-proofs against SCHUFA escalation even though Art. 22 strict-reading doesn't require it today.
- **"Signaler" button** in chat (`features/chat/ui/ChatMessageBubble.tsx`): **active**. Routes user feedback to `museum-backend/src/modules/support/` for human review. Linkage to guardrail audit log is **Phase 1** work.
- **Audit trail of guardrail decisions**: append-only via `audit_log` table (hash-chained, `museum-backend/src/shared/audit/audit-chain.ts`). Today: per-transition (breaker open/close) + per-block. Phase 1 adds per-decision rows for the explainability endpoint backing store.

## Re-classification triggers (re-read this doc whenever any of these change)

| Trigger | Owner action |
|---|---|
| Adding auto-suspension of user account on N guardrail blocks | Re-classify as Art. 22 + ship explanation endpoint + recourse SOP BEFORE deployment |
| Adding admin workflow that bans/restricts users based on guardrail flags | Same as above |
| B2B customer requests attribution of "problematic visitors" back to them | Same as above + bilateral DPA review |
| Musaium offers a credit / scoring / employment / housing / education-evaluation feature | Full Art. 22 + AI Act Annex III high-risk conformity assessment |
| Musaium provides AI-driven content moderation as a service to third parties | Re-read this doc + DPIA + ROPA |
| EDPB issues new guidelines on conversational AI under Art. 22 | Re-read this doc + adjust |

## Documentation references

- `docs/AI_SAFETY.md` §5 (compliance touch-points)
- `docs/legal/DPIA.md` (full DPIA)
- `docs/legal/ROPA.md` (record of processing)
- `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md` (article-by-article)
- `museum-backend/src/shared/audit/` (audit-log implementation)
- CJEU C-634/21 (SCHUFA, 7 Dec 2023): https://curia.europa.eu/juris/document/document.jsf?docid=280426
- EDPB Guidelines WP251 — Article 22 automated decision-making
- GDPR Art. 22: https://gdpr-info.eu/art-22-gdpr/

## Sign-off

| Date | Reviewer | Decision |
|---|---|---|
| 2026-05-12 | Founder/tech lead | Art. 22 does not apply today. Endpoint `GET /api/chat/messages/:id/explanation` scheduled for Phase 1 as best-practice anchor. Re-read this doc on every trigger listed above. |
