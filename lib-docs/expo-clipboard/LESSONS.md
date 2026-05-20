# Lessons — expo-clipboard

Project-specific gotchas. Human-edited. Consumed by /team red/green/reviewer agents.

## 2026-05-20

- **TOTP recovery codes are copied to the clipboard with no auto-clear.** `features/auth/screens/MfaEnrollScreen.tsx:83` does `Clipboard.setStringAsync(recoveryCodes.join('\n'))`. expo-clipboard has NO auto-clear / `clearClipboard` API — the secret codes persist on the OS clipboard until overwritten, readable by other apps. This is an accepted tradeoff (codes are shown once, bcrypt-hashed server-side, user must capture them), but: (a) keep the "save these now / we cannot show them again" warning, (b) consider noting they're on the clipboard, (c) NEVER add auto-paste of recovery codes anywhere. If a finding requires clearing, the only option is a best-effort timed `setStringAsync('')` — racy if the app is backgrounded; do not present it as a guarantee.
- **`setStringAsync` returns a boolean and can fail silently on web (WebKit).** Show the "Copied" confirmation only after `await` resolves truthy. `useMessageActions.ts:20` awaits then alerts — correct. Do not fire the toast optimistically.
- **No clipboard reads in the codebase, by design.** There are zero `getStringAsync`/`hasStringAsync` calls. Don't introduce auto-read-on-mount or auto-paste of secrets — reading triggers OS paste banners (iOS 14+) / access toasts (Android 12+) and is a privacy red flag. Read only on explicit user gesture, and prefer `hasStringAsync()` to gate a Paste button rather than a speculative `getStringAsync`.
