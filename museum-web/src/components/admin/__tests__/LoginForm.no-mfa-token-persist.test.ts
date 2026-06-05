/**
 * T6.1 guard (R12) — `mfaSessionToken` must live ONLY in transient React state.
 *
 * Static source scan of `LoginForm.tsx`: no line may write `mfaSessionToken`
 * (or its state variable) to `localStorage` / `sessionStorage` / `document.cookie`,
 * and no `console.*` line may reference it. Per-line scan (not whole-file regex)
 * per the architect string-guard discipline.
 *
 * This is a GUARD, not a feature-RED: it PASSES against the current LoginForm
 * (which has no challenge step) and continues to pass against the T5.3 impl as
 * long as the token is never persisted/logged. It FAILS only if a future edit
 * leaks the token (NFR security / spec R12).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGIN_FORM = resolve(__dirname, '..', 'LoginForm.tsx');

function lines(): string[] {
  expect(existsSync(LOGIN_FORM), `${LOGIN_FORM} must exist`).toBe(true);
  return readFileSync(LOGIN_FORM, 'utf8').split('\n');
}

// A persistence/log sink that, on the SAME line, also references an mfa session
// token. Token reference is matched broadly (`mfaSessionToken`, `mfaSession`,
// `mfaToken`) so a renamed local cannot dodge the guard.
const TOKEN_REF = /mfa(?:Session)?Token|mfaSession\b/i;
const STORAGE_SINK = /\b(?:localStorage|sessionStorage)\b/;
const COOKIE_WRITE = /document\.cookie\s*=/;
const CONSOLE_CALL = /\bconsole\.\w+\s*\(/;

describe('LoginForm.tsx — mfaSessionToken is never persisted or logged (R12)', () => {
  it('does not write an mfa session token to localStorage / sessionStorage', () => {
    const offending = lines().filter((l) => STORAGE_SINK.test(l) && TOKEN_REF.test(l));
    expect(offending).toEqual([]);
  });

  it('does not write an mfa session token to document.cookie', () => {
    const offending = lines().filter((l) => COOKIE_WRITE.test(l) && TOKEN_REF.test(l));
    expect(offending).toEqual([]);
  });

  it('does not log an mfa session token via console.*', () => {
    const offending = lines().filter((l) => CONSOLE_CALL.test(l) && TOKEN_REF.test(l));
    expect(offending).toEqual([]);
  });
});
