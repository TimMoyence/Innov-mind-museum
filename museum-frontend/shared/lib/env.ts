/**
 * Canonical reader for `process.env.X` variables in `museum-frontend`.
 *
 * Why this helper exists — local vs CI typing divergence:
 *   - Locally, Expo's `metro-require` ambient declares `process.env` as
 *     `Dict<string>`, so `process.env.X` is `string | undefined` and
 *     `process.env.X ?? 'default'` is `string`.
 *   - In CI, the Expo ambient is unreachable from the lint pass, so
 *     `process.env.X` is `any` and triggers `@typescript-eslint/no-unsafe-*`.
 *
 * No simple wrap survives BOTH `eslint --fix` AND both gates:
 *   - drop wrap                  → CI red `no-unsafe-*`
 *   - `String(value)`            → local red `no-unnecessary-type-conversion`
 *   - cast `as string`           → autoremoved by `eslint --fix`
 *   - cast + eslint-disable line → CI red `reportUnusedDisableDirectives`
 *
 * Solution: a `typeof`-narrowing predicate. ESLint cannot autofix away the
 * `typeof` check, and the narrowed branch yields `string` on both sides.
 *
 * Trimming: enabled by default. Defensive (matches the prior majority
 * `trimOrUndefined` pattern) without observable cost for well-formed DSNs /
 * URLs / numeric strings. An env value made of whitespace is treated as
 * absent.
 *
 * Always import this helper — do NOT redefine `typeofString`, `trimOrUndefined`,
 * or a local `readEnvString` in modules. Audit 2026-05-16 (T1.9) unified the
 * three historical variants.
 *
 * @see commit 681eef19 — original `typeofString` introduction.
 * @see CLAUDE.md § "Pièges connus" → bullet `process.env.X` typed differently.
 *
 * @param value - The `process.env.X` read (typed `unknown` to absorb the
 *                local-vs-CI divergence).
 * @returns The trimmed string when non-empty, otherwise `undefined`.
 */
export const readEnvString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
