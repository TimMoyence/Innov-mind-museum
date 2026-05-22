# expo-linking — LESSONS (project gotchas)

## 2026-05-20
- **`Linking` in app code = `react-native`, NOT `expo-linking`.** Every
  `import ... Linking` in `museum-frontend` is `from 'react-native'` (verified
  2026-05-21). There is no direct `from 'expo-linking'` import — expo-linking is
  pulled transitively by `expo-router`, which owns the deep-link config. Don't
  "fix" RN `Linking.openURL` calls to expo-linking; the RN surface is correct here.
- **URL scheme is `musaium`** (`app.config.ts` `APP_SCHEME = 'musaium'`,
  `scheme: APP_SCHEME`). Build redirect URIs with `createURL('path')` — never
  hand-concatenate `musaium://...` (breaks across Expo Go vs standalone).
- **SECURITY — outbound URL scheme allowlist (TD-MD-02, in force).**
  `features/chat/application/chatSessionLogic.pure.ts:364+` (`decideMarkdownLinkAction`)
  gates LLM-authored links via `new URL(url).protocol` allowlisting (NOT
  `startsWith`), blocking `intent://` `javascript:` `data:` `file:` `http:` from
  reaching `Linking.openURL`. `https:`→in-app, `mailto:/tel:/sms:`→system, else
  ignore; malformed URL→ignore. **Replicate for ANY user/LLM-controlled outbound URL.**
- **SECURITY — validate parsed deep-link params.** `Linking.parse(...).queryParams`
  is `string | string[] | undefined` and fully attacker-controlled (anyone crafts a
  `musaium://` link). Narrow types, allowlist keys, validate values before nav/redeem.
- **`openURL` rejects** on no-handler/user-cancel — always `.catch(...)`. Musaium
  does `.catch(() => undefined)` in museum-enrichment links.
- **`useLinkingURL()` is DEPRECATED → `useURL()`.**
- **Let expo-router resolve route deep links;** use raw `parse()` only for
  non-route payloads (e.g. a one-time redeem token in a query param).
