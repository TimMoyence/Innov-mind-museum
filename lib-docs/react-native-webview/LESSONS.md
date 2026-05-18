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

## ✅ Strong security defenses
- `javaScriptCanOpenWindowsAutomatically={false}` → blocks programmatic window.open
- ZERO `injectedJavaScript` / `injectedJavaScriptBeforeContentLoaded` / `ref.injectJavaScript()` (zero XSS via script injection)
- ZERO `onMessage` handler (no postMessage bridge)
- `mixedContentMode` not set (Android default 'never')
- `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs` default false
- No cookie sharing flags (no auth bridge risk)
- `source={{uri:url}}` not `source={{html}}` (no concat HTML/scripts)
