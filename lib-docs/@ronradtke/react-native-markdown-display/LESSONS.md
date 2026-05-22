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

## 2026-05-20 — refresh (lib-doc-curator, UFR-022)

Re-audit. **All four 2026-05-18 findings are now REMEDIATED** — verdict flips to **APPROVED**.

### SEC-MD-01 ✅ FIXED — confirm dialog before open
- `useChatSessionActions.ts:85` `onMessageLinkPress` now `Alert.alert`s with the destination **hostname** (`new URL(url).hostname`) before `params.setBrowserUrl(url)`. User can spot a spoofed host. Returns `false` (suppresses lib's `Linking.openURL`), opens in-app on confirm.

### SEC-MD-02 ✅ FIXED — scheme allowlist via `new URL().protocol`
- `chatSessionLogic.pure.ts:366` `decideMarkdownLinkAction` uses `new URL(url).protocol.toLowerCase()` (NOT `startsWith`). `https:`→`'in-app'`, `{mailto:,tel:,sms:}`→`'system'`, **everything else→`'ignore'`** (incl. `http:`, `intent://`, `file://`, `javascript:`, `data:`). Malformed URLs throw → caught → `'ignore'`. This is the canonical TD-MD-02 / Wave-8 expo-linking pattern. Pure function = unit-testable in isolation.
- Note: `http:` is now REJECTED (downgrade-attack defense), stricter than the original SEC-MD-02 ask.

### SEC-MD-03 + SEC-MD-04 ✅ FIXED — image rule suppressed entirely
- `MarkdownBubble.tsx:20` `markdownRules: RenderRules = { image: () => null }`. An injected `![](https://evil/x.png)` renders NO `<Image>` → NO network GET. Closes tracking-pixel / IP-leak / client-SSRF + the `data:image/svg+xml` script vector in one move. Stronger than `allowedImageHandlers={['https://']}` AND stays fully typed (no untyped markdown-it instance). Enriched artwork images go through the dedicated carousel, never markdown `![]()`, so nothing legitimate is lost.

### Version reality check
- Pin `^8.1.0`. **npm latest = 8.1.0** — the prior LESSONS/snapshot "8.1.1 (Jan 21 2025)" was a GitHub *tag*, never published to npm. `^8.1.0` is already newest installable. No bump available, no advisories. Transitive `markdown-it@14.1.1` (lib declares `^13.0.1`) — no advisories.

### Residual / watch
- `link` rule stays ENABLED (correct — links are legitimate in replies, gated by the confirm+allowlist above). If a future edit disables the gate or switches the allowlist back to `startsWith`, that re-opens SEC-MD-01/02. Reviewer MUST block any such change citing PATTERNS §4.
- markdown-it HTML is off by default (no raw `<script>` passthrough) — but never rely on that alone; the `href`/`src` gating in §4 is the actual control.
