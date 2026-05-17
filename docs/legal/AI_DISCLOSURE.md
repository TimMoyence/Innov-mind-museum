# AI Act Article 50 — user-facing disclosure compliance

> Status: implemented 2026-05-12. Effective for app version >= 1.2.3.
> Owner: legal + mobile platform. Reviewed by: editor agent, /team enterprise run `2026-05-12-llm-guard-perennial-implementation`.

## 1. What we disclose

Three concurrent, layered surfaces inform the user that Musaium is an AI assistant:

1. **Visual blocking modal** — `VoiceSessionIntro` renders before the microphone activates on every voice session. Title, AI-notice subtitle, audio-status indicator, "Start" CTA. Full-screen, cannot be bypassed.
2. **Audio greeting** — on modal mount, the OS-native TTS (`expo-speech`) speaks the localised disclosure copy (`voice.disclosure.audioGreeting`) in the active locale. Per the EC draft guidelines for Article 50, a naturalistic synthetic voice (Musaium uses `gpt-4o-mini-tts`, voice `alloy`) must carry an *audible* disclosure — a visual badge alone is insufficient.
3. **Persistent visual badge** — `ChatHeader` shows a tappable "AI / IA / KI / …" pill next to the session title. Tapping it opens `AiDisclosureModal` with the recap copy and a "Learn more" link to this document's public URL.

A passive footer (`AiDisclosureFooter`) is also rendered below the chat thread for the *text*-only disclosure baseline that already pre-dated this change.

## 2. When

| Surface | Trigger | Frequency |
|---|---|---|
| `VoiceSessionIntro` | First tap on the microphone of a voice session | Every new session (`sessionId` change) |
| Audio greeting | Modal mount | Once per modal mount |
| AI badge | Mounted alongside the session title | Persistent for the duration of the chat |
| `AiDisclosureModal` recap | User taps the AI badge | On demand |
| `AiDisclosureFooter` | Mounted below the message list | Persistent |

The session-scoped acknowledgement is intentional: Article 50 requires disclosure "at the latest at the time of the first interaction", and "first interaction" is interpreted per-session, not per-install. A user returning a week later to a fresh session sees the disclosure again. The flag is stored under `musaium.voice.disclosure_acknowledged.<sessionId>` in `expo-secure-store` (or in memory on web).

## 3. Why

- **Article 50 §1** — providers must ensure AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons are informed they are interacting with an AI system, at the latest at the time of the first interaction.
- **Recital 142** — the disclosure must be clear and distinguishable to the user, taking into account the circumstances of the interaction. For voice-first interfaces using naturalistic synthesized voices, the EC draft guidelines on Article 50 implementation (December 2025) recommend an audible disclosure in addition to any visual cue.
- **Article 99** — non-compliance is sanctioned by an administrative fine up to EUR 15 000 000 or 3 % of worldwide annual turnover (whichever is higher for non-SMEs, lower for SMEs).
- Effective date: **2 August 2026**. Musaium ships the disclosure ≥ 2 months ahead of the deadline to allow for two release cycles of soak-testing.

## 4. Implementation references

| File | Role |
|---|---|
| `museum-frontend/features/chat/ui/VoiceSessionIntro.tsx` | Pre-mic disclosure modal + audio greeting playback |
| `museum-frontend/features/chat/hooks/useVoiceDisclosure.ts` | Session-scoped acknowledgement state + SecureStore persistence |
| `museum-frontend/features/chat/ui/AiDisclosureModal.tsx` | On-demand recap modal opened from the AI badge |
| `museum-frontend/features/chat/ui/ChatHeader.tsx` | Hosts the persistent AI badge button |
| `museum-frontend/app/(stack)/chat/[sessionId].tsx` | Wires the disclosure gate to the microphone trigger |
| `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx` | Persistent text footer (pre-existing, kept) |
| `museum-frontend/__tests__/features/chat/useVoiceDisclosure.test.ts` | Unit tests for the gate hook |

Audio greeting playback uses `expo-speech` loaded via a lazy `require()`; if the module is unavailable (web, dev build without pod install) the visual disclosure still satisfies Article 50 and the status indicator reads "Audio greeting unavailable on this device".

## 5. Locales covered (8)

| Locale | Title | AI notice | Audio greeting source key |
|---|---|---|---|
| ar | مرحبًا، أنا مساعد Musaium | أنا ذكاء اصطناعي. قد أرتكب أخطاء. | `voice.disclosure.audioGreeting` |
| de | Hallo, ich bin der Musaium-Assistent | Ich bin eine künstliche Intelligenz. Ich kann Fehler machen. | `voice.disclosure.audioGreeting` |
| en | Hello, I'm the Musaium assistant | I'm an artificial intelligence. I can make mistakes. | `voice.disclosure.audioGreeting` |
| es | Hola, soy el asistente de Musaium | Soy una inteligencia artificial. Puedo cometer errores. | `voice.disclosure.audioGreeting` |
| fr | Bonjour, je suis l'assistant Musaium | Je suis une intelligence artificielle. Je peux faire des erreurs. | `voice.disclosure.audioGreeting` |
| it | Ciao, sono l'assistente Musaium | Sono un'intelligenza artificiale. Posso commettere errori. | `voice.disclosure.audioGreeting` |
| ja | こんにちは、MusaiumのAIアシスタントです | 私は人工知能です。間違えることもあります。 | `voice.disclosure.audioGreeting` |
| zh | 您好，我是 Musaium 助手 | 我是人工智能，可能会出错。 | `voice.disclosure.audioGreeting` |

All locale source files live under `museum-frontend/shared/locales/<locale>/translation.json` under the `voice.disclosure.*` namespace.

## 6. Update protocol

Any change to the disclosure copy (title, AI notice, audio greeting, or badge label) must:

1. Be applied uniformly across all 8 locales — `npm run check:i18n` in `museum-frontend/` must pass.
2. Be recorded in an ADR (`docs/adr/ADR-NNN-ai-disclosure-copy-update.md`) with the previous and new copy verbatim plus the rationale (legal opinion, EC guidance change, user research, etc.).
3. Be logged in the audit trail. The current copy is considered the canonical disclosure text — any drift is a compliance risk.

Removing or weakening the modal, badge, or audio greeting requires:

- Sign-off from legal counsel,
- An ADR documenting the legal basis (e.g. Article 50 carve-out, change in regulation),
- A migration plan if existing sessions have a persisted ack flag that would become invalid.

## 7. Out of scope (here)

- Backend disclosure rendering (web admin panel and email templates) — tracked separately.
- Public privacy policy page hosting the "Learn more" target — current implementation falls back to the in-app `/privacy` route; switch to a stable external URL when the marketing site goes live.
- GPAI provider disclosures (OpenAI, Deepseek, Google) — they are responsible for their own Article 53 documentation; Musaium does not redistribute their models.

## 8. Granular third-party AI consent (S4-P0-02 — Apple Guideline 5.1.2(i))

> Added 2026-05-16 by audit-360 S4 worktree. Effective backend `v1.2.3` ; mobile build after this branch ships. See **ADR-053** for the full design.
> Layered on top of the existing AI-interaction disclosure (Article 50 §1) — does NOT replace it.

### Why a separate consent layer

AI Act Art. 50 (covered in §1–6 above) is a **transparency** obligation : tell the user they are interacting with AI. Apple App Store Review Guideline 5.1.2(i), tightened on 2025-11-13, is a **consent** obligation : capture explicit, separate, non-bundled user agreement before transmitting personal data to third-party AI providers. The two are orthogonal — Musaium ships both. GDPR Art. 7(1)/(2)/(3) reinforces this by requiring consent to be freely given, specific, informed, unambiguous, granular, and as easy to withdraw as to give.

### Scope catalogue

Per-data-category × per-provider grants persisted in `user_consents` and replayable from `audit_logs` :

| Scope identifier                            | Data category               | Provider |
|---------------------------------------------|-----------------------------|----------|
| `third_party_ai_text_openai` **(required)** | Text messages               | OpenAI   |
| `third_party_ai_image_openai`               | Photos                      | OpenAI   |
| `third_party_ai_audio_openai`               | Voice transcripts           | OpenAI   |
| `third_party_ai_profile_openai`             | Preferences + visit history | OpenAI   |
| `third_party_ai_text_google`                | Text messages               | Google AI|
| `third_party_ai_image_google`               | Photos                      | Google AI|
| `third_party_ai_audio_google`               | Voice transcripts           | Google AI|
| `third_party_ai_profile_google`             | Preferences + visit history | Google AI|

DeepSeek scopes intentionally omitted — already blocked in EU prod by the S4-P0-04 CI sentinel. If DeepSeek is later reactivated for a non-EU deployment, four additional scopes (`third_party_ai_<category>_deepseek`) must be added in `userConsent.entity.ts CONSENT_SCOPES` + i18n keys + this catalogue.

### Consent capture flow

1. First chat-session open after registration (or after `AsyncStorage` `consent.ai_accepted` is cleared) :
   - The `AiConsentSheetContent` bottom-sheet opens, full-screen, blocking.
   - All 8 Switches default OFF (no pre-checked boxes — Art. 4(11)).
   - The `third_party_ai_text_openai` row carries a `(required)` badge ; Save stays disabled until it is toggled ON.
   - On Save : FE POSTs `/api/auth/consent` once per granted scope ; each call writes a `user_consents` row + a hash-chained `CONSENT_GRANTED_THIRD_PARTY_AI` audit row. Per-scope BE failures are captured to Sentry (tags `flow=consent.grant`, `scope=<scope>`) without blocking the remaining grants. `AsyncStorage` flips to `'true'` so the sheet is not re-prompted on next launch.
2. Subsequent revocation : Settings → "Third-party AI providers" card → toggle off any row. The card calls `DELETE /api/auth/consent/:scope` which stamps `revoked_at` on the active row + emits a `CONSENT_REVOKED_THIRD_PARTY_AI` audit row. Optimistic UI ; rollback on BE failure with Sentry capture (tags `flow=consent.revoke.settings`).

### What is *not* claimed (UFR-013 honesty)

This section will be read by DPO + App Store reviewers, so the gaps are documented up front :

- **The chat pipeline does NOT functionally short-circuit on revoke.** Today only `location_to_llm` is enforced. A user who revokes `third_party_ai_text_openai` AFTER first granting it will still receive chat replies from OpenAI on subsequent messages. The consent layer is **persistence + audit + UX intent** ; full enforcement = account-deletion path (DSAR / `DELETE /api/auth/account`). Documented as a known gap in ADR-053 § Follow-ups (T-S4-P0-02-bis-enforce) and **must** be remediated before any second App Store submission cycle if Apple challenges it.
- **The DPIA T1.1 lawful-basis narrative is not changed.** The canonical basis stays `6(1)(b)` contract performance. The new granular layer is **additional** evidence under `6(1)(a)` for the Apple gate. DPO ratification of the layering decision is pending (blocked on S2.T-S2-8 DPO mandate). A `## Addendum 2026-05-16` will be added to `docs/legal/DPIA.md` § T1.1 once DPO is mandated.
- **`tos_privacy` registration bundle is unchanged.** ToS + Privacy stay bundled in `auth.agree_terms_rich` ; the new layer concerns ONLY third-party AI consent, which is now separated out from the bundle. This was the actual audit C2 finding.

### Reviewer-facing checklist (for App Store submission)

- [x] Consent is **explicit** — user must tap each Switch (default OFF) and tap Save.
- [x] Consent is **separate** — distinct screen from registration ToS/Privacy.
- [x] Consent is **non-bundled** — per (category × provider) tuple, 8 independent Switches.
- [x] Consent is **withdrawable** — one-tap toggle in Settings → "Third-party AI providers".
- [x] Audit trail is hash-chained and replayable (`audit_logs`, action `CONSENT_GRANTED_THIRD_PARTY_AI` / `CONSENT_REVOKED_THIRD_PARTY_AI`).
