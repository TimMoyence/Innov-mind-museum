# Password Hash Migration Plan — bcrypt → argon2id (TD-29)

> **Status:** PLAN ONLY — no code change. Execution is **DEFER-POST-LAUNCH**
> (V1 ships on bcrypt). This document is the design referenced by `docs/TECH_DEBT.md`
> TD-29 + TD-BC-02 so the eventual migration is a deliberate, reviewed change.
>
> - **Date:** 2026-05-20.
> - **Trigger:** `node.bcrypt.js` is in low-maintenance mode upstream; OWASP
>   (2025/2026) recommends **argon2id** as the first-choice password KDF
>   (memory-hard ⇒ GPU/ASIC-resistant, side-channel resistant).
> - **Current state:** all hashing goes through `BCRYPT_ROUNDS = 12`
>   (`museum-backend/src/shared/security/bcrypt.ts`), consumed by 4 hash sites
>   + 3 compare sites (see §2). Cost factor floor is now guarded by
>   `tests/unit/auth/bcrypt-cost-factor.test.ts` (≥ 12, ≤ 15).

---

## 1. Why not now

V1 launch is bcrypt-12, which is **OWASP-acceptable** (not deprecated, just
no longer first-choice). A KDF swap touches the auth-critical path and needs a
dual-hash transition window + backfill — too much risk to bundle into the
pre-launch hardening sweep. The honest framing: this is a *hardening upgrade*,
not a *vulnerability fix*. Defer to a dedicated post-launch sprint.

## 2. Affected sites (verified 2026-05-20)

Hash (write) sites — all use `BCRYPT_ROUNDS`:

| Site | Purpose |
|---|---|
| `modules/auth/adapters/secondary/pg/user.repository.pg.ts:44` | signup password |
| `modules/auth/adapters/secondary/pg/user.repository.pg.ts:72` | admin-set / change password |
| `modules/auth/useCase/password/resetPassword.useCase.ts:30` | password reset |
| `modules/auth/useCase/totp/recoveryCodes.ts:50` | MFA recovery code hashing |
| `scripts/seed-smoke-account.ts:141` | post-deploy smoke account seed |

Compare (verify) sites:

| Site | Purpose |
|---|---|
| `modules/auth/useCase/password/changePassword.useCase.ts:31,44` | current/new password checks |
| `modules/auth/useCase/totp/recoveryCodes.ts:63` | recovery-code verification |
| (login verify) `modules/auth/useCase/session/*` | login compare |

## 3. Migration strategy — dual-hash transition (no forced reset)

The `User.password` / recovery-code hash columns are **self-describing**: a
bcrypt hash starts with `$2a$`/`$2b$`, an argon2id hash with `$argon2id$`. This
lets us run both algorithms side-by-side with **zero forced password resets**.

### Phase A — add argon2id, write-new + verify-both (one release)

1. `pnpm add argon2` (native; verify it ships a prebuilt for the prod
   `linux/x64` image — else add a build step to `Dockerfile.prod`).
2. New `shared/security/password-hash.ts` facade:
   - `hash(plain)` → **argon2id** with OWASP params
     (`memoryCost: 19456 KiB (19 MiB)`, `timeCost: 2`, `parallelism: 1` — the
     OWASP "first recommended option"; tune to ~250 ms on the prod CPU).
   - `verify(plain, stored)` → **dispatch on prefix**: `$argon2id$` → argon2.verify ;
     `$2a$/$2b$` → bcrypt.compare.
   - `needsRehash(stored)` → `true` when stored is bcrypt OR argon2 params drift.
3. Route every site in §2 through the facade.
4. **TD-BC-02 rehash-on-login**: in the login + changePassword success path,
   after a successful `verify`, if `needsRehash(stored)` → re-hash the plaintext
   (still in scope) with argon2id and persist. Opportunistic, no user friction.

### Phase B — backfill the cold tail (optional, weeks later)

Most active users migrate via Phase A rehash-on-login. For dormant accounts,
either (a) leave them on bcrypt (the dual-verify path stays forever-safe), or
(b) run a one-off job that can't rehash (no plaintext) → flag for
reset-on-next-login. Recommendation: **(a)** — dual-verify is cheap and the
bcrypt floor (12) is acceptable indefinitely.

### Phase C — drop bcrypt (only if (b) chosen + tail drained)

Only once telemetry shows ~0 `$2*$` hashes remaining. Remove the bcrypt branch
from the facade + `pnpm remove bcrypt`. Keep `bcrypt-cost-factor.test.ts` until
this phase (then delete with the dep). **Likely never executed** if Phase B
option (a) is chosen — dual-verify is the stable end state.

## 4. Risks & guards

- **Native build**: argon2 is a native addon — confirm the prebuilt resolves in
  the Xcode-Cloud-independent backend Docker image; mirror the
  `onnxruntime-node` lazy-load lesson if it doesn't.
- **Login latency budget**: argon2id at 19 MiB / t=2 ≈ bcrypt-12 wall-time;
  load-test `perf:auth` (k6) before/after.
- **Memory pressure**: 19 MiB × concurrent logins. At 200 concurrent logins
  that's ~3.8 GB transient — size the container or lower `memoryCost` with a
  documented trade-off.
- **Recovery codes**: same dual-hash facade applies; migrate in the same release.

## 5. Acceptance (when executed)

1. `verify` accepts both `$2*$` and `$argon2id$` hashes (unit test, both vectors).
2. rehash-on-login upgrades a bcrypt hash to argon2id after a successful login
   (integration test asserts the stored hash prefix flips).
3. `perf:auth` p95 within the auth latency budget post-swap.
4. New signups produce `$argon2id$` hashes (unit test).
5. TD-29 + TD-BC-02 closed together.
