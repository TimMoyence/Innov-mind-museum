# Lessons — react-native-webview (v13.16.0)

Audit 2026-05-18 : **PASS-WITH-MEDIUM**. Single production WebView (in-app browser sheet).

## ⚠️ M1 MEDIUM : `originWhitelist: ['http://*', 'https://*']` trop broad (residual phishing)
- **Cause** : `InAppBrowserSheetContent.tsx:154` accept ANY HTTP/HTTPS origin. PATTERNS DON'T : 'laisser originWhitelist au défaut [http://*,https://*] en production'.
- **Mitigation in place** : `onShouldStartLoadWithRequest` filtre non-http(s) (javascript:, file:, data:, content:, blob:, intent:, ftp:) + handoff mailto:/tel: à Linking. Neutralise scheme-injection MAIS PAS arbitrary HTTPS phishing.
- **Residual risk** : si user-supplied 'url' prop est attacker-controlled (LLM-generated link, deep-link), phishing/credential-harvesting page peut render full-screen avec app chrome.
- **Fix TD-RNWV-01** : either restrict `originWhitelist` à explicit domain list OR enforce caller-side URL allowlist + document trust model.

## ⚠️ L1 LOW : `onRenderProcessGone` handler absent
- Android OOM kill → silent dead WebView (not security, UX cliff).
- **Fix TD-RNWV-02** : add `onRenderProcessGone={() => setLoadError(true)}` per PATTERNS L144.

## 2026-05-20

Re-audit (UFR-022 bundle refresh). Verdict: **PASS-WITH-MEDIUM** (unchanged) + **patch-bump recommended**.

### ⬆️ B1 LOW : Musaium pins 13.16.0, latest is 13.16.1 — bump recommended
- 13.16.1 (2026-02-27) fixes an iOS crash: `nil NSString` → `std::string` conversion triggers `SIGABRT`. Same crash *class* as the documented Musaium `expo-web-browser` SIGABRT (CLAUDE.md § Pièges connus, PR #258 / hotfix `f7ec92f7`).
- No security advisory, no breaking change, no API delta. `clearCache` already `required` since 13.16.0.
- **Fix TD-RNWV-03** : `npx expo install react-native-webview` to float 13.16.0 → 13.16.1 (stays in Expo SDK 55 range). Re-run WebView Maestro flow after bump.

### ℹ️ M1 residual phishing — mitigation stronger than 2026-05-18 audit recorded
- The WebView `url` prop is fed by `useChatSessionActions.ts:85 onMessageLinkPress` (links inside LLM-generated chat messages — attacker-influenceable).
- BUT `onMessageLinkPress` routes through `decideMarkdownLinkAction(url)` and, for `'in-app'` https links, shows an `Alert.alert` confirm dialog displaying the **destination hostname** before `setBrowserUrl(url)`. Non-allowlisted schemes ignored; mailto/tel handed to `Linking`.
- This host-confirm gate materially reduces (does not eliminate) the broad-`originWhitelist` phishing risk. M1 stays MEDIUM (a spoofed-but-plausible hostname can still pass the dialog), TD-RNWV-01 still open, but caller-side defense is real and should be cited in the trust-model doc.

### GHSA-36j3-xxf7-4pqg (Universal XSS Android, CVE-2020-6506)
- Affected ≤ 10.10.2, fixed ≥ 11.0.0. Musaium 13.16.0 = safe. Vector re-opens only if `setSupportMultipleWindows={false}` — Musaium never sets it (default `true`). Keep it that way.

## ✅ Strong security defenses
- `javaScriptCanOpenWindowsAutomatically={false}` → blocks programmatic window.open
- ZERO `injectedJavaScript` / `injectedJavaScriptBeforeContentLoaded` / `ref.injectJavaScript()` (zero XSS via script injection)
- ZERO `onMessage` handler (no postMessage bridge)
- `mixedContentMode` not set (Android default 'never')
- `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs` default false
- No cookie sharing flags (no auth bridge risk)
- `source={{uri:url}}` not `source={{html}}` (no concat HTML/scripts)
