# EU AI Act 2024/1689 — Conformity Matrix for Musaium

> **Status :** Musaium B2C = **limited-risk** under AI Act, Art. 50 transparency only (per [`compliance-research-eu-ai-act.md`](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-eu-ai-act.md) §2).
> **Last reviewed :** 2026-05-12 · **Reviewer :** Tim Moyence
> **Next review :** 2026-08 (Art. 50 enforcement date) and on every B2B LOI signing (potential reclassification).

The matrix below tracks each AI Act article that **may** apply to Musaium and the current evidence trail. Limited-risk obligations (Art. 50 + Art. 5 prohibitions) are active or imminent ; high-risk obligations (Art. 9-15) are deferred per the **2026-05-07 Omnibus provisional accord** (Annex III autonomous systems → 2027-12 ; products → 2028-08). The transparency Art. 50 deadline remains **2026-08-02** and is NOT deferred.

---

## Status legend

- **COMPLIANT** — evidence exists, controls in place.
- **IN PROGRESS** — work underway, target date defined.
- **PARTIAL** — some controls exist, gaps documented.
- **DEFERRED** — not applicable at current classification ; trigger condition defined.
- **N/A** — out of scope by article text or by classification.

---

## Title I — General provisions

| Article | Obligation summary | Status | Evidence / location | Owner | Phase |
|---|---|---|---|---|---|
| **Art. 3** — Definitions | Identify our role as "provider" + "deployer" of an AI system | COMPLIANT | [`compliance-research-eu-ai-act.md`](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-eu-ai-act.md) §5 — Musaium = provider + deployer | Founder | Done |
| **Art. 4** — AI literacy | Team has working knowledge of AI Act | COMPLIANT (active since 2025-02) | Internal — solo dev, founder is fluent. Re-document when first FTE joins | Founder | Done (refresh on hire) |

---

## Title II — Prohibited practices

| Article | Obligation summary | Status | Evidence / location | Owner | Phase |
|---|---|---|---|---|---|
| **Art. 5(1)(a)** — Subliminal manipulation | No technique materially distorting behavior contrary to free will | COMPLIANT | [`docs/compliance/art5-audit.md`](./art5-audit.md) §1 | Founder | Done |
| **Art. 5(1)(b)** — Exploitation of vulnerable persons (age, disability, social-economic) | No exploitation mechanism ; voice-first to minors needs special vigilance | COMPLIANT | [`docs/compliance/art5-audit.md`](./art5-audit.md) §2 | Founder | Done |
| **Art. 5(1)(c)** — Social scoring by public authorities | N/A — Musaium is private B2C/B2B, not authority | N/A | [`docs/compliance/art5-audit.md`](./art5-audit.md) §3 | — | — |
| **Art. 5(1)(d)** — Predictive policing | N/A | N/A | [`docs/compliance/art5-audit.md`](./art5-audit.md) §4 | — | — |
| **Art. 5(1)(e)** — Untargeted facial scraping | N/A — Musaium uses SigLIP for **artworks**, not facial recognition. Visitor photos may incidentally include faces ; ROPA covers this | COMPLIANT | [`docs/legal/ROPA.md`](../legal/ROPA.md) + [`docs/AI_VISUAL_SIMILARITY.md`](../AI_VISUAL_SIMILARITY.md) + [`docs/compliance/art5-audit.md`](./art5-audit.md) §5 | Founder | Done |
| **Art. 5(1)(f)** — Emotion recognition in workplace / education | **CHECK** — Musaium is cultural, not workplace/education evaluation. Document non-applicability | COMPLIANT | [`docs/compliance/art5-audit.md`](./art5-audit.md) §6 | Founder | Done |
| **Art. 5(1)(g)** — Biometric categorisation by sensitive attributes | N/A | N/A | [`docs/compliance/art5-audit.md`](./art5-audit.md) §7 | — | — |
| **Art. 5(1)(h)** — Real-time biometric ID in public space | N/A | N/A | [`docs/compliance/art5-audit.md`](./art5-audit.md) §8 | — | — |

**Enforcement** : active since 2025-02-02. Penalty Art. 99 : up to €35 M or 7 % global turnover (SME : the lower of the two).

---

## Title III — High-risk AI systems

Musaium is **limited-risk** at current classification ; this section is deferred but tracked for B2B escalation scenario (Annex III §3 educational evaluation).

| Article | Obligation summary | Status | Evidence / trigger condition | Owner | Phase |
|---|---|---|---|---|---|
| **Art. 9** — Risk Management System (RMS) | Continuous documented RMS | DEFERRED — limited-risk | Trigger : first B2B LOI with educational-evaluation use case. Skeleton in [`docs/RUNBOOKS/guardrail-incidents.md`](../RUNBOOKS/guardrail-incidents.md) + design.md §15 risk register | Founder | Phase 2 |
| **Art. 10** — Data and data governance | Bias examination + mitigation, contextual characteristics | PARTIAL — bias monitoring shipped early | [`docs/compliance/FAIRNESS_METRICS_PLAN.md`](./FAIRNESS_METRICS_PLAN.md) — Phase 1.A counters + 1.B alerts already cover §2(f), §2(g), §4 | Founder | Phase 1 |
| **Art. 11** — Technical documentation | Annex IV documentation (architecture, training data, performance, limitations) | DEFERRED — limited-risk | Skeleton to be created at first B2B LOI signing (per research §8 Action 7) | Founder | Phase 1B |
| **Art. 12** — Record-keeping | Automatic logging of relevant events, ≥6 months retention | COMPLIANT (over-engineered for current classification) | [`museum-backend/src/shared/audit/audit-chain.ts`](../../museum-backend/src/shared/audit/audit-chain.ts) + IP anonymization 13-month retention + S3 Object Lock 7-year archive (Phase 1) | Founder | Done (active enhancement Phase 1) |
| **Art. 13** — Transparency to deployers | Instructions of use for B2B deployers | DEFERRED — limited-risk | Trigger : first B2B contract. Template to be drafted | Founder | Phase 2 |
| **Art. 14** — Human oversight | Capability to intervene / suspend, operator training | PARTIAL | "Signaler" button in mobile UI = recourse path. Suspend mechanism = circuit breaker + admin disable endpoint. Operator training is N/A pre-FTE | Founder | Phase 1 (partial) → Phase 2 (full) |
| **Art. 15** — Accuracy, robustness, cybersecurity | Performance metrics declared, resistance to adversarial inputs, red-team | PARTIAL — red-team via Promptfoo CI planned | Trigger : pentest scope ([`docs/operations/PENTEST_SCOPE.md`](../operations/PENTEST_SCOPE.md)) post-B2B GA | Founder | Phase 2 |

---

## Title IV — Transparency (limited-risk obligations)

| Article | Obligation summary | Status | Evidence / location | Owner | Phase |
|---|---|---|---|---|---|
| **Art. 50 §1** — Disclosure of AI interaction | Inform user they interact with AI at first interaction (text + voice) | COMPLIANT | Implemented 2026-05-12. Evidence: `docs/legal/AI_DISCLOSURE.md`. Mobile : badge "Assistant IA Musaium" on first session (`features/chat/ui/VoiceSessionIntro.tsx`). Web : equivalent badge on landing. Voice : audio announcement "Vous interagissez avec un assistant IA" at start of each session. | Founder | Done |
| **Art. 50 §2** — Synthetic content marking | AI-generated text + audio marked as such | PARTIAL | TTS audio is implicitly synthetic ; explicit machine-readable mark deferred to draft Code of Practice ([Bird & Bird](https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-understanding-the-draft-transparency-code-of-practice)) | Founder | Phase 1 |
| **Art. 50 §3** — Emotion recognition / biometric categorisation disclosure | N/A — Musaium does not perform | N/A | — | — | — |
| **Art. 50 §4** — Deep-fake disclosure | N/A — Musaium does not generate deep-fakes | N/A | — | — | — |

**Enforcement** : 2026-08-02. Penalty Art. 99 : up to €15 M or 3 % global turnover (SME : the lower). This is the **highest-priority Phase 0 deliverable** per research §10.

---

## Title V — General-Purpose AI (GPAI) provider relationships

Musaium uses OpenAI, Deepseek, Google as GPAI providers. Musaium is **downstream deployer**, NOT a GPAI provider.

| Article | Obligation summary | Who owns | Evidence |
|---|---|---|---|
| **Art. 53(1)(a)** — Technical documentation of the model | GPAI provider | OpenAI / Deepseek / Google publications |
| **Art. 53(1)(b)** — Make information available downstream | GPAI provider | API docs, model cards |
| **Art. 55** — Systemic risk evaluation (>10²⁵ FLOP) | OpenAI / Google (Frontier models) | — |
| **Art. 25** — Provider obligations if substantial modification | Musaium — TRIGGER : never bypass GPAI fine-tune that changes intended purpose | [`docs/AI_VOICE.md`](../AI_VOICE.md) confirms no fine-tuning |
| **Art. 26** — Deployer obligations | Musaium | Monitoring + audit log already covered |
| **Art. 28** — Sub-processor (GDPR sense) | Musaium | [`docs/compliance/SUBPROCESSORS.md`](./SUBPROCESSORS.md) — DPAs with each |

---

## Title IX — Penalties

| Article | Range | Trigger |
|---|---|---|
| **Art. 99(3)** — Prohibited practices | up to €35 M or 7 % turnover | Art. 5 violation |
| **Art. 99(4)** — High-risk non-compliance + Art. 50 | up to €15 M or 3 % turnover | Art. 9-15, Art. 50 violation |
| **Art. 99(5)** — Incorrect information to authorities | up to €7.5 M or 1 % turnover | Art. 21/26 violation |

SME (Musaium falls here pre-Series A) : the **lower** of the two caps applies (Art. 99(6)).

---

## Compliance trail (where the evidence lives)

- **Doctrine** : this matrix + [`compliance-research-eu-ai-act.md`](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-eu-ai-act.md).
- **Code paths owned by guardrail** : `museum-backend/src/modules/chat/useCase/guardrail/`, `museum-backend/src/shared/audit/`.
- **Operational evidence** : [`docs/RUNBOOKS/guardrail-incidents.md`](../RUNBOOKS/guardrail-incidents.md), [`infra/grafana/alerting/llm-guard-bias.yml`](../../infra/grafana/alerting/llm-guard-bias.yml).
- **Compliance docs** : [`docs/legal/DPIA.md`](../legal/DPIA.md), [`docs/legal/ROPA.md`](../legal/ROPA.md), [`docs/compliance/DATA_FLOW_MAP.md`](./DATA_FLOW_MAP.md), [`docs/compliance/SUBPROCESSORS.md`](./SUBPROCESSORS.md), [`docs/compliance/FAIRNESS_METRICS_PLAN.md`](./FAIRNESS_METRICS_PLAN.md), [`docs/compliance/art5-audit.md`](./art5-audit.md).
- **Pentest preparation** : [`docs/operations/PENTEST_SCOPE.md`](../operations/PENTEST_SCOPE.md).

---

## Re-review triggers

This matrix is updated when ANY of the following occurs :

1. A new AI Act delegated act or guideline is published affecting limited-risk obligations.
2. The 2026-05-07 Omnibus accord is formally adopted (potential changes to deferred Annex III deadlines).
3. A B2B LOI is signed (potential reclassification to high-risk via Annex III §3).
4. A pentest finding maps to an AI Act robustness obligation (Art. 15).
5. Musaium starts fine-tuning a model (Art. 25 substantial modification trigger).

---

## Sign-off

| Role | Name | Date | Comment |
|---|---|---|---|
| Provider / Deployer responsible | Tim Moyence | 2026-05-12 | Initial drafting |
| Legal counsel | TBD | — | First B2B LOI trigger |
| DPO | N/A — < 250 employees | — | — |
