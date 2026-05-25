# B7 — A11y / WCAG / EN 301 549 correctness review

**Scope**: "Lot P0 a11y & compliance lockdown #298" (`e62b93f75`, merged 2026-05-25) + `648328cb9` (i18n bottomSheet.dismiss) + `95c931104` (e2e de-flake).
**Angle**: correctness — do the fixes actually resolve the WCAG / EN 301 549 violation, or are they cosmetic? Edge-case regression? RTL/logical-side?
**Method**: read final state, recompute contrast ratios from design tokens, ran the FE suite (330 suites / 3385 tests **PASS**, includes the 5 new RNTL specs). UFR-013: every claim cites `path:line` or a computed value.

## Note: **8.0 / 10** · Verdict: **fixes mostly solid, one symmetric defect left unfixed**

The structural fixes are genuine (not cosmetic): opacity removal, content-type partition, Speech.stop cleanup, skip-link, SBOM attest all hold up. Two real weaknesses dent it: the always-on live region (regression risk on Android scrollback) and an **identical masking defect left on the USER bubble** that the lot just fixed for the assistant bubble.

---

## ✅ Fixes solides

### I-CMP1 — AiDisclosureFooter opacity removal (genuine AA fix)
`features/chat/ui/AiDisclosureFooter.tsx:33-40` — `opacity:0.7` removed, text now renders at full `theme.textSecondary`. Recomputed contrast over the **actual** render context (footer sits inside a `GlassCard`, `ChatSessionSurface.tsx:92`):
- Light: text `#334155` over glass bg (`#FFFFFF`@0.44 over light gradient) = **9.4–9.7:1** ✅
- Dark: text `#94A3B8` over glass bg (`#1E293B`@0.72 over dark gradient `#0F172A`/`#1E293B`) = **5.71–6.07:1** ✅
- Old `@0.7` effective: ~3.95–4.35:1 → **was failing AA**. Removal is the correct structural fix.
The code comment's "solid-on-solid floor clears AA" claim holds for the real context. (BlurView adds visual translucency, but the RN `backgroundColor` token is the deterministic floor; worst realistic case 5.71:1 passes 4.5:1.)

### I-CMP3(1)(2) — Speech.stop() cleanup + partition (verified by behavioral tests)
`features/chat/application/useChatSession.ts:142-155` — effect cleanup `void Speech?.stop()` correctly stops on unmount (R3) and before each re-run (R4). `useChatSession.audioDescription.test.ts:165-244` asserts real ordering via `invocationCallOrder` (stop precedes 2nd speak) — not a mock-of-the-thing-under-test. Partition `if (last.text.trim()) return;` (`:129`) gives server-TTS exclusive ownership of body-text messages → no double-playback; both directions tested (`:246`, `:275`). Lazy `require('expo-speech')` + type-only import keeps test/web bundles safe.

### I-CMP3(5) — assistant bubble no longer masks reply text
`features/chat/ui/ChatMessageBubble.tsx:187-192` — removed `accessibilityRole="text"` + static `accessibilityLabel` from the assistant `<Pressable>`; inner `<MarkdownBubble>` text now exposed naturally; long-press hint kept. `ChatMessageBubble.a11yText.test.tsx` verifies real text reachable + no masking label + hint preserved. Genuine WCAG 1.3.1/4.1.2 fix.

### I-CMP3(3) — Switch a11y
`features/settings/ui/SettingsAccessibilityCard.tsx:36-38` — `accessibilityRole="switch"` + label + `accessibilityState={{ checked: enabled }}`. State is **dynamic** (driven by `enabled`), so it tracks toggles correctly. Tested in `SettingsAccessibilityCard.test.tsx`.

### I-CMP5 — web skip-link (correct & complete)
`museum-web/src/app/[locale]/layout.tsx:32-41` — skip-link is the FIRST focusable element (before `<Header>`, which returns null on /admin/* so couldn't host it), `href="#main"` → `<main id="main" tabIndex={-1}>` (tabIndex=-1 makes the landmark programmatically focusable), `sr-only focus:not-sr-only`, copy from `dict.a11y.skipToContent` (present in en.json:3 + fr.json:3, typed in i18n.ts:20). Playwright `public-skip-link.a11y.spec.ts` asserts first-Tab→link, href, non-empty name, Enter→main, dual-locale + axe. WCAG 2.4.1 satisfied. Domain `musaium.app`→`.com` corrected in both `docs/legal/accessibility-statement-{en,fr}.md`.

### I-CMP6 — SBOM cosign attestation (honest, additive)
- BE `ci-cd-backend.yml:794+` reuses existing cosign-installer + `id-token`/`attestations` perms (already at lines 777/687-688) — wiring valid.
- Web `ci-cd-web.yml:339+` correctly adds its own cosign-installer + perms (didn't have them).
- Mobile `ci-cd-mobile.yml:100+` SBOM is artifact-only (no attestation) — honestly justified (EAS gives no local image digest to bind a predicate to), gap tracked in TECH_DEBT TD-CMP6-SBOM-ATTEST + ADR-068. All steps `continue-on-error: true` (advisory, non-blocking) per ADR intent.

---

## ⚠️ Fixes faibles / régressifs

### [MEDIUM] USER bubble STILL masks the user's message text — symmetric defect left unfixed
`features/chat/ui/ChatMessageBubble.tsx:237-238` — the user-message `<View>` still carries `accessibilityRole="text"` + static `accessibilityLabel={t('a11y.chat.user_message')}` ("Your message"), wrapping `<Text>{message.text}</Text>` (`:149`). This is the **exact same subtree-collapsing masking defect** I-CMP3(5)/R8 just removed from the assistant bubble — a screen reader announces "Your message" / "Votre message" instead of the actual typed content. The audio-description audience re-reading conversation history loses all user-turn content. The lot scoped R8 to assistant-only; the violation is symmetric. **Not tracked in TECH_DEBT.** (WCAG 1.3.1 / 4.1.2.)

### [MEDIUM] StreamingBody live region is unconditional → Android re-announce risk on every completed message
`features/chat/ui/bubbleSections/StreamingBody.tsx:54` — `accessibilityLiveRegion="polite"` wraps `<MarkdownBubble>` with **no `isStreaming` guard**. Every assistant message renders a `StreamingBody` (`ChatMessageBubble.tsx:132`), and only the last one is actually streaming (`ChatMessageList.tsx:182` `isItemStreaming`). So ALL past assistant messages in scrollback are permanent `polite` live regions. On Android, when the virtualized list recycles/re-renders cells during scroll, TalkBack can spuriously re-announce stale message content. Correct pattern: gate the live region on `isStreaming` so only the active reply is a live region; completed replies revert to static text. The 2nd test case (`StreamingBody.liveRegion.test.tsx:42` "keeps a polite live region even when not streaming") actively codifies the wrong behavior. Severity tempered by `polite` (queues, doesn't interrupt) and that iOS VoiceOver largely ignores `accessibilityLiveRegion` (Android-centric API).

### [LOW] Skip-link Playwright test under-asserts focus move
`museum-web/e2e/a11y/public-skip-link.a11y.spec.ts:39-42` — after `Enter` it only checks `main#main` is **visible**, not that focus actually moved to `<main>`. With `tabIndex={-1}` the hash nav should focus it, but the test wouldn't catch a regression where focus stays on the link. Structural fix is correct; assertion is just weaker than it should be.

### [LOW] Maestro audio-description flow doesn't verify the toggle flipped
`.maestro/settings-audio-description.yaml:60-70` — Phase 3 uses two `optional:true` taps (by id, then coordinate `90%,30%`) then only asserts the card "still renders" (no crash). Per UFR-021 it tap-throughs the happy path (satisfies the sentinel), but never reads back the switch checked-state, so a broken toggle would pass.

### [LOW] ActivityIndicator loading state has no a11y label
`SettingsAccessibilityCard.tsx:30` — while `isLoading`, the Switch is replaced by a bare `ActivityIndicator` (no label) → screen reader hears nothing during load. Brief, minor.

---

## 🔧 Reste à faire

1. **Fix the USER bubble masking** (`ChatMessageBubble.tsx:237-238`) — remove `accessibilityRole="text"`+static label exactly as done for the assistant bubble, OR replace with a label that prepends the role then exposes text. This is the only true residual WCAG violation introduced/left by the lot.
2. **Gate the live region on `isStreaming`** (`StreamingBody.tsx:54`) and rewrite the 2nd test case to assert the region is DROPPED when not streaming.
3. Remove the now-orphaned `a11y.chat.assistant_message` key (`shared/locales/{fr,en}/translation.json:943`) — no longer referenced in source (grep clean). Cleanup, not correctness.
4. Strengthen `public-skip-link.a11y.spec.ts` to assert `main#main` is `:focus` after Enter.
5. Consider exposing the long-press "report" affordance via `accessibilityActions` (assistant bubble now has a hint but no SR-triggerable action — pre-existing, not introduced here).
6. Drop the no-op `COSIGN_EXPERIMENTAL=1` env (legacy for cosign v2.4.1 keyless GA) — cosmetic.

## Residual WCAG violations after this lot
- **WCAG 1.3.1 / 4.1.2** — user-message text masked by static label (`ChatMessageBubble.tsx:237-238`). MEDIUM, untracked.
- **WCAG 4.1.3 (status messages)** — over-broad always-on live region risks Android re-announce of stale messages (`StreamingBody.tsx:54`). MEDIUM.
