# Lessons — @ronradtke/react-native-markdown-display (v8.1.0)

Audit 2026-05-18 : **🚨 CHANGES_REQUESTED — 2 MEDIUM security** (LLM prompt-injection prophilaxis).

## 🚨 SEC-MD-01 MEDIUM : Auto-open external URL SANS user confirmation
- **Cause** : `useChatSessionActions.ts:71-82` — http(s) links from LLM-generated markdown auto-open in in-app WebBrowser (`setBrowserUrl`) avec ZERO confirm dialog.
- **Impact** : LLM-controlled content (prompt-injectable, low-trust) can render arbitrary clickable hyperlinks → phishing, malware, drive-by.
- **Fix TD-MD-01** : Add confirmation dialog avant setBrowserUrl OR display target hostname in bubble (link preview) OR domain allowlist for auto-open (musée canoniques, wikipedia, wikidata) + confirm pour autres.
- **Coordinate with** : AI Safety guardrails CLAUDE.md §AI Safety — output guardrail currently keyword-only, doesn't strip URLs.

## 🚨 SEC-MD-02 MEDIUM : Non-http schemes forwarded à `Linking.openURL` SANS allowlist
- **Cause** : `chatSessionLogic.pure.ts:343-347` — any url not starting http(s) returns 'system' → library calls `Linking.openURL`. Includes mailto:/tel:/sms: (intended) BUT also `intent://` (Android deep link hijack), `app-scheme://` (deep link hijack), `file://` (iOS may open), `javascript:` (likely no-op mais unverified).
- **Fix TD-MD-02** : Replace startsWith check par explicit allowlist `['mailto:', 'tel:', 'sms:']`. Return 'ignore' pour everything else.

## ⚠️ SEC-MD-03 LOW : `allowedImageHandlers` not pinned to `['https://']`
- **Cause** : MarkdownBubble.tsx:97 no `allowedImageHandlers` prop. Lib default permits http:// + data:.
- **Impact** : LLM-emitted `![](http://attacker)` leaks user IP on plain HTTP. data:image/svg+xml can carry script in some webviews.
- **Fix TD-MD-03** : `allowedImageHandlers={['https://']}` on `<Markdown>`.

## ⚠️ SEC-MD-04 LOW : No syntax restriction for LLM-rendered markdown
- PATTERNS §4 anti-pattern : untrusted markdown should be parsed with `MarkdownIt(...).disable(['link','image'])` OR custom sanitizing rules. Currently raw LLM output goes through default MarkdownIt.
- **Fix TD-MD-04** : If links/images not strictly required in chat replies → disable at parser level. Otherwise custom link/image rules sanitize href/src against allowlist.

## ✅ Positives
- body styles set (color, fontSize, lineHeight) ✅
- decideMarkdownLinkAction returns explicit true/false (inverted-contract documented) ✅
- mergeStyle default true ✅
- RTL-safe blockquote (borderStart/paddingStart) ✅
- Rendered inside FlatList scroll container ✅

## Priority fix order
1. **SEC-MD-02** (scheme allowlist) — closes deep link hijack
2. **SEC-MD-01** (confirm before in-app browser) — closes phishing
3. **SEC-MD-03** (allowedImageHandlers=['https://'])
4. **SEC-MD-04** (parser-level disable if not used)
