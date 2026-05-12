# Art. 5 AI Act — Prohibited Practices Audit for Musaium

> **Mandate :** AI Act Regulation 2024/1689, Article 5 — prohibitions active since **2025-02-02**. Penalty for violation : up to €35 M or 7 % global annual turnover (Art. 99(3) ; SME : the lower of the two).
> **Scope :** Musaium B2C cultural assistant (mobile + web), voice + text pipeline, multi-LLM (OpenAI / Deepseek / Google) orchestrated via LangChain.
> **Method :** systematic walk-through of each Art. 5(1) prohibition against the Musaium product surface.

This audit is the evidence Musaium produces in case of regulatory inquiry. It is referenced from [`docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`](./AI_ACT_CONFORMITY_MATRIX.md) Title II rows.

---

## 1. Art. 5(1)(a) — Subliminal techniques beyond consciousness

> *"The placing on the market, the putting into service or the use of an AI system that deploys subliminal techniques beyond a person's consciousness or purposefully manipulative or deceptive techniques, with the objective or the effect of materially distorting the behaviour of a person or a group of persons..."*

**Audit verdict :** N/A — Musaium does not deploy subliminal techniques.

**Surface walked :**
- Text generation : standard LangChain orchestration with explicit conversational outputs. No hidden tokens, no encoded payloads.
- Voice (gpt-4o-mini-tts, voice "alloy") : standard speech synthesis. No infrasonic / ultrasonic content. No emotional priming via tonal manipulation beyond what is naturally produced by the TTS model on neutral text.
- UI : standard Expo Router screens with visible badges, no flash-frame manipulation, no high-frequency overlays.

**Evidence :** code paths in `museum-backend/src/modules/chat/useCase/`, `museum-frontend/features/chat/ui/`, `docs/AI_VOICE.md`.

---

## 2. Art. 5(1)(b) — Exploitation of vulnerabilities (age, disability, social-economic situation)

> *"...AI system that exploits any of the vulnerabilities of a natural person or a specific group of persons due to their age, disability or a specific social or economic situation, with the objective, or the effect, of materially distorting the behaviour of that person..."*

**Audit verdict :** COMPLIANT — no exploitation mechanism, but voice-first to minors requires named vigilance.

**Surface walked :**
- Age handling : Musaium accepts users 13+ per ToS. No age-targeted dark patterns (no "buy now or your friends laugh at you" type prompts). Tone is neutral-warm.
- Voice TTS naturalism : the `alloy` voice is naturalistic enough that the AI Act draft guidelines for Art. 50 explicitly call out voice as needing disclosure. Musaium ships an audio disclosure at session start ("Vous interagissez avec un assistant IA Musaium") — covered in [`AI_ACT_CONFORMITY_MATRIX.md`](./AI_ACT_CONFORMITY_MATRIX.md) Art. 50 row. The disclosure mitigates the risk that a minor mistakes the voice for a human.
- Vulnerable users (disability) : Musaium accessibility (VoiceOver / TalkBack support) is product polish, not exploitation surface.
- Social-economic targeting : Musaium is freemium without paywall-pressure UX patterns. No "limited-time offer" dark patterns.

**Open follow-up :** if Musaium ships a paywall with discount-urgency UX, re-audit this section.

---

## 3. Art. 5(1)(c) — Social scoring by public authorities

> *"...AI system for the evaluation or classification of natural persons or groups of persons over a certain period of time based on their social behaviour or known, inferred or predicted personal or personality characteristics..."*

**Audit verdict :** N/A — Musaium is a private B2C/B2B product, not a public authority. No social-scoring functionality.

---

## 4. Art. 5(1)(d) — Predictive policing

> *"...AI system for making risk assessments of natural persons in order to assess or predict the risk of a natural person committing a criminal offence, based solely on the profiling..."*

**Audit verdict :** N/A — Musaium is a cultural guidance chatbot. No risk-assessment functionality on natural persons.

---

## 5. Art. 5(1)(e) — Untargeted facial scraping for facial recognition

> *"...AI systems that create or expand facial recognition databases through the untargeted scraping of facial images from the internet or CCTV footage..."*

**Audit verdict :** N/A — Musaium uses **SigLIP** ONNX embeddings on **artworks** for visual similarity matching (ADR-037). The use case is matching an artwork photo (taken by the visitor) against a catalog of artwork embeddings. No facial recognition database is built or expanded.

**Surface walked :**
- Visitor photos : may incidentally include faces (someone next to a painting). The embedding is on the full image and is used only to match against artwork embeddings, not to identify persons. ROPA covers this incidental processing ([`docs/legal/ROPA.md`](../legal/ROPA.md)).
- No scraping : Musaium's artwork catalog is built from authoritative sources (museum partners, Wikidata via ADR-035), not from untargeted internet scraping.

**Evidence :** [`docs/AI_VISUAL_SIMILARITY.md`](../AI_VISUAL_SIMILARITY.md), [`docs/legal/ROPA.md`](../legal/ROPA.md), `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts`.

---

## 6. Art. 5(1)(f) — Emotion recognition in workplace / education

> *"...AI systems to infer emotions of a natural person in the areas of workplace and education institutions, except where the use of the AI system is intended to be put in place or into the market for medical or safety reasons..."*

**Audit verdict :** COMPLIANT — Musaium does **not** infer emotions. Even if it did, Musaium is **not deployed in workplace or education evaluation**.

**Surface walked :**
- The chat pipeline classifies content (topic / safety category), not user emotion.
- Voice STT (gpt-4o-mini-transcribe) transcribes audio to text. It does not perform speaker-emotion classification.
- LangChain orchestrator does not branch on inferred user emotion.
- Use case : balade culturelle hors-musée et intra-musée. B2B-scolaire scenario (museum field trip) does NOT include student evaluation ; the visitor → guide interaction is informational, not assessed.

**Trigger for re-audit :** if Musaium ships an emotion-aware feature (e.g., adapting tone based on detected user frustration), OR if a B2B-educational LOI includes student evaluation, Art. 5(1)(f) becomes actively constraining.

**Surprising research finding :** the prohibition applies to **workplace / education institutions** specifically. A cultural app used during a field trip is not by itself in scope — the institutional context (formal evaluation, attendance enforcement) is what triggers the prohibition.

---

## 7. Art. 5(1)(g) — Biometric categorisation by sensitive attributes

> *"...biometric categorisation systems that categorise individually natural persons based on their biometric data to deduce or infer their race, political opinions, trade union membership, religious or philosophical beliefs, sex life or sexual orientation..."*

**Audit verdict :** N/A — Musaium performs no biometric categorisation. The SigLIP embeddings (artwork visual similarity) are not biometric data ; they encode visual style features of artworks, not natural persons.

---

## 8. Art. 5(1)(h) — Real-time remote biometric identification in public space

> *"...the use of 'real-time' remote biometric identification systems in publicly accessible spaces for the purposes of law enforcement..."*

**Audit verdict :** N/A — Musaium is neither a law-enforcement system nor a biometric identification system. The visitor uses Musaium on their personal device, not a public-space camera array.

---

## Cross-reference summary

| Art. 5(1) sub | Verdict | Rationale section above |
|---|---|---|
| (a) Subliminal | N/A | §1 |
| (b) Vulnerability exploitation | COMPLIANT (vigilance flagged for minors via voice naturalism) | §2 |
| (c) Social scoring (public auth) | N/A | §3 |
| (d) Predictive policing | N/A | §4 |
| (e) Untargeted facial scraping | N/A | §5 |
| (f) Emotion recognition in workplace/education | COMPLIANT (no inference + cultural context not in scope) | §6 |
| (g) Sensitive-attribute biometric categorisation | N/A | §7 |
| (h) Real-time remote biometric ID in public space | N/A | §8 |

---

## Re-audit triggers

This audit must be redone if **any** of the following occurs :
1. Musaium fine-tunes any LLM (changes the inference behavior past vendor warranty).
2. Musaium adds emotion-aware features (tone, pace adaptation based on inferred user state).
3. Musaium ships an in-app purchase / paywall with urgency-based dark patterns.
4. Musaium signs a B2B-educational contract that includes student evaluation.
5. The AI Act Commission publishes guidelines further constraining any (a)-(h) interpretation.
6. Musaium ships visual recognition that crosses from artworks → people (e.g., visitor face matching).

---

## Sign-off

| Role | Name | Date | Comment |
|---|---|---|---|
| Founder / Provider responsible | Tim Moyence | 2026-05-12 | Initial audit complete. Verdicts above are conservative — when in doubt, document. |
| Legal counsel | TBD | — | First B2B LOI trigger |
| DPO | N/A — < 250 employees | — | — |

---

## Sources

- [Article 5 — Prohibited AI Practices, official text](https://artificialintelligenceact.eu/article/5/)
- [Article 5 — AI Act Service Desk commentary](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-5)
- [Article 99 — Penalties](https://artificialintelligenceact.eu/article/99/)
- [`compliance-research-eu-ai-act.md`](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-eu-ai-act.md) §6
- [LCFI — Children and the AI Act](https://www.lcfi.ac.uk/news-events/blog/post/eu-ai-act-how-well-does-it-protect-children-and-young-people)
