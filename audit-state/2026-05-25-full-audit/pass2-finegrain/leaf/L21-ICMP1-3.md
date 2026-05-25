# L21 — I-CMP1 / I-CMP2 / I-CMP3 fine-grain re-audit

Fresh-context READ-ONLY audit. Branch `dev` @ HEAD `1fb32f5ba`. Every item re-derived from current code; no prior audit/marker trusted.

---

## I-CMP1 — AiDisclosureFooter contrast (AI Act Art. 50) — VERDICT: ✅ PASS (genuine, recomputed)

**Code state** — `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx:33-40`
- `styles.text` has **no `opacity`** property. Text renders at full token contrast with `color: theme.textSecondary` (line 20). Comment lines 36-39 document the structural fix.
- Footer mounts in a `GlassCard` over the page gradient — `ChatSessionSurface.tsx:92`.

**Contrast recomputed from tokens** (WCAG 2.1 sRGB relative-luminance formula; tokens from `tokens.generated.ts` + `tokens.functional.ts`):

LIGHT — `textSecondary = textColors.secondary = #334155` over glass `rgba(255,255,255,0.44)` composited on gradient stops `#EAF2FF / #D8E8FF / #D5F0FF`:
- worst stop (over #D8E8FF blend → eff #E9F2FF): **9.18:1**
- over #D5F0FF blend: **9.44:1** ; over white: 10.35:1

DARK — `textSecondary = darkTextColors.secondary = #94A3B8` over dark glass `rgba(30,41,59,0.72)` on `#0F172A / #1E293B`:
- worst (over elevated #1E293B): **5.71:1** ; over default blend: 6.07:1

**All ≥ 4.5:1 AA.** Roadmap claim "9.4 light / 5.7 dark" matches my recompute (9.44 / 5.71). The removed `opacity:0.7` would have darkened/lightened the effective text toward the background (≈ pushing below 4.5 as originally documented 3.55-4.09:1), so removal is the real structural fix, not cosmetic.

**Residual:** none.

---

## I-CMP2 — 40 consent keys × 8 locales — VERDICT: ✅ PASS (verified, all complete)

**Method** — flattened `consent` namespace in all 8 locale files `museum-frontend/shared/locales/<loc>/translation.json` and diffed key sets against `en`.

- `en` consent namespace = **exactly 40 flat keys** (matches the documented count).
- Locales present: ar, de, en, es, fr, it, ja, zh (8/8).
- Per-locale result (all): **40 keys, missing=0, extra=0, empty=0.**
- Values are genuine translations, not English fallbacks: spot-checked `accept_all` / `manage_choices` / `title` / `body` — all locale-specific (Japanese すべて同意, Chinese 全部接受, Arabic قبول الكل, German Alle akzeptieren, etc.).
- En-copy scan: only **1** non-en value identical to en → `fr.scope_image = "Photos"` (legitimate FR/EN cognate, both "Photos"; not a fallback leak). All other 7 locales: 0 identical.

The roadmap-flagged cookie-banner Accept-all / Manage keys (`accept_all`, `manage_choices`) are present and translated everywhere.

**Residual:** none.

---

## I-CMP3 — Audio-description a11y (5 sub-points) — VERDICT: ⚠️ PARTIAL — 4/5 genuine, 2 residual violations

### (1) Speech.stop has a caller — ✅ PASS
`useChatSession.ts:151` — `void Speech?.stop()` in the autoplay `useEffect` cleanup (line 149-155). Runs before next effect run (interrupts queued utterance) and on unmount/blur. Genuine; was zero-caller before.

### (2) Double-playback partition — ✅ PASS (airtight)
`useChatSession.ts:129` — `if (last.text.trim()) return;` → expo-speech autoplay only fires for **bodyless** messages (imageDescription-only).
Cross-checked the other engine: `useAutoTts.ts:55` — `if (!lastMessage.text || …) return;` → server-TTS only fires when body text **exists**.
The two engines are mutually exclusive on `text` presence → exactly one engine auto-plays a given message. No double-playback.
- Minor design note (not a defect): a message with BOTH body text AND `imageDescription` → server-TTS reads the body, the imageDescription is NOT auto-read. Intentional per the partition.

### (3) Switch role / label / state — ✅ PASS
`SettingsAccessibilityCard.tsx:36-38` — `accessibilityRole="switch"`, `accessibilityLabel={t('settings.audio_description')}`, `accessibilityState={{ checked: enabled }}`. All three present on the live `<Switch>` (the `isLoading` branch renders an ActivityIndicator instead — acceptable, transient).

### (4) Live region — ⚠️ PASS-with-caveat (NOT conditional)
`StreamingBody.tsx:54` — `<View accessibilityLiveRegion="polite">` wraps `<MarkdownBubble>`; cursor "▍" correctly kept OUTSIDE (lines 57-61). The live region announces incremental streamed content. Good.
**BUT the live region is hardcoded ON, not gated on `isStreaming`** — and `StreamingBody` is rendered for **every** assistant message (`ChatMessageBubble.tsx:132`), so **all** assistant bubbles (finalized history included) carry a permanent polite live region. This is a deliberate decision (test `StreamingBody.liveRegion.test.tsx:42-50` asserts "keeps a polite live region even when not streaming").
- iOS/VoiceOver: `accessibilityLiveRegion` is Android-only → no impact.
- Android/TalkBack: re-announces on content change within the region. For static finalized history the content doesn't change → low practical re-announce risk in steady state, BUT leaving N permanent live regions is non-idiomatic; a re-render that remounts `MarkdownBubble` (theme/locale change) on a finalized message could re-announce its full body. WCAG 4.1.3 robustness concern, **not a hard fail.** The brief's "is it conditional?" hypothesis is correct: it is NOT conditional.

### (5) Bubble label masks text — ❌ RESIDUAL VIOLATION (USER bubble)
Assistant side: ✅ fixed — `ChatMessageBubble.tsx:187-192` removed `accessibilityRole="text"` + static label, keeps only `accessibilityHint`. Confirmed; `a11y.chat.assistant_message` is now a **dead i18n key** (zero code reference outside locales/tests).

**USER bubble still has the identical defect** — `ChatMessageBubble.tsx:227-241`:
```
accessibilityRole="text"                          // line 237
accessibilityLabel={t('a11y.chat.user_message')}  // line 238 → "Your message"
```
This `View` wraps `{bubbleContent}` whose user branch is `<Text>{message.text}</Text>` (line 149). `role="text"` + a static `accessibilityLabel` **collapses the subtree and replaces the real user-typed text** with the literal "Your message". A screen-reader user reviewing their own chat history hears "Your message" instead of what they actually sent.
- This is the SAME anti-pattern explicitly documented as removed on the assistant side (comment lines 187-191).
- **WCAG 1.3.1 (Info & Relationships) + 4.1.2 (Name, Role, Value)** — residual.
- Verified label value: `en a11y.chat.user_message = "Your message"`.
- **Test gap:** `ChatMessageBubble.a11yText.test.tsx` (I-CMP3(5)/R8) only exercises `makeAssistantMessage` — it never renders a user bubble, so the user-side masking was never caught. The fix + test were scoped assistant-only.

---

## Summary table

| Item | Verdict | path:line | Residual |
|---|---|---|---|
| I-CMP1 | ✅ PASS | AiDisclosureFooter.tsx:33-40 (no opacity); recompute 9.18-9.70:1 light / 5.71-6.07:1 dark | none |
| I-CMP2 | ✅ PASS | locales/*/translation.json consent (40 keys × 8 locales, 0 missing/empty) | none |
| I-CMP3(1) | ✅ PASS | useChatSession.ts:151 Speech.stop cleanup | none |
| I-CMP3(2) | ✅ PASS | useChatSession.ts:129 + useAutoTts.ts:55 partition | none |
| I-CMP3(3) | ✅ PASS | SettingsAccessibilityCard.tsx:36-38 role/label/state | none |
| I-CMP3(4) | ⚠️ caveat | StreamingBody.tsx:54 live region NOT conditional, on all assistant bubbles | WCAG 4.1.3 robustness (minor) |
| I-CMP3(5) | ❌ FAIL (user side) | ChatMessageBubble.tsx:237-238 user bubble role="text"+static label | WCAG 1.3.1 / 4.1.2 — user message text masked by "Your message" |

**Overall I-CMP3 is NOT fully closed.** Assistant-side masking is fixed; the user bubble carries the same defect, untested. Recommended fix: drop `accessibilityRole="text"` + `accessibilityLabel={t('a11y.chat.user_message')}` from the user `<View>` (ChatMessageBubble.tsx:237-238) — same change applied to the assistant Pressable; the inner `<Text>{message.text}</Text>` then exposes naturally. Optionally gate `StreamingBody` live region or scope it to the streaming message to remove the latent TalkBack re-announce on history.
