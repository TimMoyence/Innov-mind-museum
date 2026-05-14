# F8 — TypeORM `.set({ field: undefined })` Silent-Skip Audit

**Date** : 2026-05-13
**Auditor** : Critical Gap Agent F8 (Claude Opus 4.7)
**Scope** : `museum-backend/src/` — all TypeORM `UpdateQueryBuilder.set()` + `Repository.update()` call sites
**Method** : pure source forensics — `grep`/`Read` only, no web

---

## 0. The Bug — Mechanism Confirmed at Source Level

TypeORM `UpdateQueryBuilder.createUpdateExpression()` filters columns whose
value is `=== undefined` **before** generating the `SET` clause.

Verified at `museum-backend/node_modules/typeorm/browser/query-builder/UpdateQueryBuilder.js:289-295` :

```js
// it doesn't make sense to update undefined properties, so just skip them
const valuesSetNormalized = {};
for (const key in valuesSet) {
    if (valuesSet[key] !== undefined) {
        valuesSetNormalized[key] = valuesSet[key];
    }
}
```

**Critical** : `EntityManager.update(target, criteria, partialEntity)` (a.k.a.
`repo.update(...)`) is **not a separate code path** — it forwards to
`createQueryBuilder().update(target).set(partialEntity)` internally. Verified at
`museum-backend/node_modules/typeorm/browser/entity-manager/EntityManager.js:343-361`.
Therefore every `repo.update(criteria, { field: undefined })` is *also*
vulnerable to the silent skip.

The documented workaround uses a raw SQL expression : `field: () => 'NULL'`.
TypeORM treats function values as raw SQL fragments and bypasses the
`undefined`-filter check.

---

## 1. Verified Existing Fix — `verifyEmail` (HISTORIC BUG-5, FIXED)

Commit `9d1e971a52e286d9747bd2fc96424ab05a95b8b5` (2026-05-03)
"fix(be): green pre-roadmap audit — 6 bugs across e2e harness + chat + auth"

> Bug 5 — TypeORM verifyEmail never cleared `verification_token`:
> user-repository verifyEmail asserts NULL raw SET.

**File** : `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:165-188`

```ts
async verifyEmail(hashedToken: string): Promise<User | null> {
  // TypeORM UpdateQueryBuilder.set() SKIPS columns whose value is `undefined`,
  // so writing `verification_token: undefined` would leave the consumed token
  // intact and allow infinite replays. ...
  const result = await this.repo
    .createQueryBuilder()
    .update(User)
    .set({
      email_verified: true,
      verification_token: () => 'NULL',
      verification_token_expires: () => 'NULL',
    })
    ...
}
```

Fix is **correct** and unit-tested at
`museum-backend/tests/unit/auth/user-repository.test.ts:385-395` —
test asserts each NULL-emitter is `typeof === 'function'` and returns `'NULL'`.

---

## 2. CRITICAL Silent-Bug Findings — Replays Still Possible

### 2.1 `consumeResetTokenAndUpdatePassword` — SEVERITY HIGH

**File** : `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:130-148`

```ts
async consumeResetTokenAndUpdatePassword(token, hashedPassword): Promise<User | null> {
  const result = await this.repo
    .createQueryBuilder()
    .update(User)
    .set({
      password: hashedPassword,
      reset_token: undefined,            // ← SILENTLY SKIPPED
      reset_token_expires: undefined,    // ← SILENTLY SKIPPED
    })
    .where('reset_token = :token AND reset_token_expires > NOW()', { token })
    .returning('*')
    .execute();
  ...
}
```

**Risk** : after a successful password reset, the `reset_token` and
`reset_token_expires` columns are **NOT cleared**. Identical token can be
replayed until natural expiry (presumably hours). Any attacker who intercepts
or guesses the URL once gets a rolling password-reset window for the entire
TTL — exactly the same class of bug as verifyEmail (Bug 5) but for the reset
flow.

Same shape, same severity, same fix : replace `undefined` → `() => 'NULL'`.

**Unit test (`user-repository.test.ts:302-313`) freezes the broken behavior** :

```ts
expect(qb.set).toHaveBeenCalledWith({
  password: '$2b$12$newhash',
  reset_token: undefined,           // ← test asserts broken contract
  reset_token_expires: undefined,
});
```

The test must be updated when the fix lands.

### 2.2 `consumeEmailChangeToken` — SEVERITY HIGH

**File** : `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:224-242`

```ts
async consumeEmailChangeToken(hashedToken): Promise<User | null> {
  const result = await this.repo
    .createQueryBuilder()
    .update(User)
    .set({
      email: () => '"pending_email"',
      pending_email: undefined,             // ← SILENTLY SKIPPED
      email_change_token: undefined,        // ← SILENTLY SKIPPED
      email_change_token_expiry: undefined, // ← SILENTLY SKIPPED
    })
    .where('email_change_token = :hashedToken AND email_change_token_expiry > NOW()', { hashedToken })
    .returning('*')
    .execute();
  ...
}
```

**Risk** : after a successful email change, `pending_email`,
`email_change_token`, and `email_change_token_expiry` are **NOT cleared**. The
same hashed token (or any subsequent token, since `pending_email` remains
populated) keeps satisfying the partial unique index and can be re-played.
SEC-HARDENING M13 (session revocation on email change) is bypassed if the
attacker still has a refresh token, because the `pending_email` ghost may
trigger downstream flows that key off it.

Test at `user-repository.test.ts:472-478` again **freezes the broken
contract** — must be updated alongside the fix.

### 2.3 `updatePassword` (used by ChangePasswordUseCase) — SEVERITY MEDIUM

**File** : `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:111-121`

```ts
async updatePassword(userId: number, newPassword: string): Promise<User> {
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await this.repo.update(userId, {
    password: hashedPassword,
    reset_token: undefined,              // ← SILENTLY SKIPPED (repo.update == .set under the hood)
    reset_token_expires: undefined,      // ← SILENTLY SKIPPED
  });
  ...
}
```

**Risk** : MEDIUM rather than HIGH because this method is invoked from
`changePassword.useCase.ts:54` *after* the current password is verified — the
attacker would need credentials already. But a residual non-null `reset_token`
left over from a prior unused reset-link request would survive a voluntary
password change, weakening the audit trail and breaking the GDPR expectation
that password-change cleans secondary credential material.

Fix : same `() => 'NULL'` pattern.

---

## 3. Other `.update().set(...)` + `repo.update(...)` Call Sites — REVIEWED CLEAN

| # | File:Line | Fields set | Risk assessment |
|---|---|---|---|
| 1 | `auth/adapters/secondary/pg/user.repository.pg.ts:83` | `reset_token: token, reset_token_expires: expires` | Both values are **always defined** at call site (`forgotPassword.useCase.ts:48-50` builds them from `crypto.randomBytes`). Safe. |
| 2 | `auth/adapters/secondary/pg/user.repository.pg.ts:155-158` | `verification_token: hashedToken, verification_token_expires: expires` | Same shape, both always defined. Safe. |
| 3 | `auth/adapters/secondary/pg/user.repository.pg.ts:216-220` (`setEmailChangeToken`) | `email_change_token, pending_email, email_change_token_expiry` | All values mandatory at call site (`changeEmail.useCase.ts`). Safe. |
| 4 | `auth/adapters/secondary/pg/user.repository.pg.ts:246` | `onboarding_completed: true` | Literal. Safe. |
| 5 | `auth/adapters/secondary/pg/user.repository.pg.ts:251` | `contentPreferences: preferences` (param typed `ContentPreference[]`) | Type-safe — `undefined` would be a TS error. Safe. |
| 6 | `auth/adapters/secondary/pg/user.repository.pg.ts:256` | `ttsVoice: voice` (param typed `string \| null`) | `null` passes through correctly — only `undefined` is filtered. **Pattern is correct** : the `\| null` annotation lets you intentionally clear the column. Safe. |
| 7 | `auth/adapters/secondary/pg/user.repository.pg.ts:265` | `mfaEnrollmentDeadline: deadline` (param `Date \| null`) | Same pattern as ttsVoice — correctly typed. Safe. |
| 8 | `auth/adapters/secondary/pg/totp-secret.repository.pg.ts:60` | `enrolledAt: at, lastUsedAt: at` | Both `Date` params, mandatory. Safe. |
| 9 | `auth/adapters/secondary/pg/totp-secret.repository.pg.ts:67` | `lastUsedAt: at` | `Date` param, mandatory. Safe. |
| 10 | `auth/adapters/secondary/pg/totp-secret.repository.pg.ts:72` | `recoveryCodes: codes` | Array param, mandatory. Safe. |
| 11 | `auth/adapters/secondary/pg/refresh-token.repository.pg.ts:112-115` (`rotate`) | `rotatedAt: new Date(), replacedByTokenId: nextRow.id` | Both literal/mandatory. Safe. |
| 12 | `auth/adapters/secondary/pg/refresh-token.repository.pg.ts:130` | `revokedAt: () => 'COALESCE("revokedAt", NOW())'` | Raw SQL expression — explicit. Safe. |
| 13 | `auth/adapters/secondary/pg/refresh-token.repository.pg.ts:166` (`revokeAllForUser`) | `revokedAt: new Date()` | Literal. Safe. |
| 14 | `auth/adapters/secondary/pg/refresh-token.repository.pg.ts:187-189` (`revokeFamily` w/ reuse) | `revokedAt + reuseDetectedAt` as raw SQL COALESCE | Safe. |
| 15 | `auth/adapters/secondary/pg/refresh-token.repository.pg.ts:196-198` (`revokeFamily` no reuse) | `revokedAt` as raw SQL COALESCE | Safe. |
| 16 | `auth/adapters/secondary/pg/userConsent.repository.pg.ts:40` (`revoke`) | `{ revokedAt: new Date() }` | Literal. Safe. |
| 17 | `auth/adapters/secondary/pg/apiKey.repository.pg.ts:46` (`remove`) | `{ isActive: false }` | Literal. Safe. |
| 18 | `auth/adapters/secondary/pg/apiKey.repository.pg.ts:52` (`updateLastUsed`) | `{ lastUsedAt: new Date() }` | Literal. Safe. |
| 19 | `chat/jobs/chat-purge.job.ts:137` | `{ purgedAt: () => 'NOW()' }` | Raw SQL — explicit. Safe. |
| 20 | `chat/adapters/secondary/persistence/chat-repository-audio.ts:10-17` (`updateMessageAudio`) | `audioUrl, audioGeneratedAt, audioVoice` — all mandatory in `input` type | Safe. |
| 21 | `chat/adapters/secondary/persistence/chat-repository-audio.ts:25-28` (`clearMessageAudio`) | `{ audioUrl: null, audioGeneratedAt: null, audioVoice: null }` | Explicit `null` — NOT `undefined`. Safe. **Reference implementation of the correct pattern for nullable Date/string fields.** |
| 22 | `knowledge-extraction/adapters/secondary/pg/typeorm-extracted-content.repo.ts:47` | `{ status }` | Mandatory param. Safe. |
| 23 | `support/adapters/secondary/pg/support.repository.pg.ts:145` | `{ updatedAt: new Date() }` | Literal. Safe. |
| 24 | `support/adapters/secondary/pg/support.repository.pg.ts:161` (`updateTicket`) | Dynamic `Partial<SupportTicket>` built with `if (input.x !== undefined)` guards | **Safe by design** — the `!== undefined` filter is performed **at the application layer** (lines 155-157) before passing to TypeORM. `null` for `assignedTo` (unassign) passes through correctly. |
| 25 | `review/adapters/secondary/pg/review.repository.pg.ts:78` | `{ status: input.status }` | Mandatory enum param. Safe. |
| 26 | `museum/useCase/crud/updateMuseum.useCase.ts:16` → `MuseumRepositoryPg.update` (`museum.repository.pg.ts:47-72`) | Uses **`save()` not `.update().set()`** w/ `applyUpdates(entity, input)` that guards each field with `!== undefined` (lines 75-84) | Safe — manual `if (input.x !== undefined) entity.x = input.x` pattern, then `repo.save(entity)`. The save() path does NOT have the silent-skip behavior. |

---

## 4. Nullable Date / "*At" Columns Cross-Reference

Inventory of date/timestamp columns that can legitimately be set to NULL (from
entity definitions). Each is either correctly handled or surfaced above as a
silent bug.

| Column | Entity | Set-to-NULL site | Status |
|---|---|---|---|
| `verifiedAt` (= `email_verified` flag, no Date) | User | N/A boolean | OK |
| `reset_token_expires` | User | `consumeResetTokenAndUpdatePassword:140`, `updatePassword:116` | **BUG 2.1 + 2.3 — silent skip** |
| `verification_token_expires` | User | `verifyEmail:178` via `() => 'NULL'` | Fixed (2.0) |
| `email_change_token_expiry` | User | `consumeEmailChangeToken:232` | **BUG 2.2 — silent skip** |
| `mfaEnrollmentDeadline` | User | `setMfaEnrollmentDeadline:265` w/ explicit `Date \| null` param | OK |
| `ttsVoice` | User | `updateTtsVoice:256` w/ explicit `string \| null` param | OK |
| `dateOfBirth` | User | (only on insert) | OK |
| `enrolledAt` | TotpSecret | `upsertEnrollment:36` (entity-property assign + `save()`), `markEnrolled:60` (only sets non-null `at`) | OK |
| `lastUsedAt` | TotpSecret | `markUsed:67`, `upsertEnrollment` via save() | OK |
| `revokedAt` | AuthRefreshToken | `revokeByJti:130` raw COALESCE, `revokeAllForUser:166` literal Date, `revokeFamily:187/197` raw COALESCE | OK |
| `rotatedAt` | AuthRefreshToken | `rotate:113` literal | OK |
| `reuseDetectedAt` | AuthRefreshToken | `revokeFamily:188` raw COALESCE | OK |
| `revokedAt` | UserConsent | `revoke:40` literal Date | OK |
| `lastUsedAt` | ApiKey | `updateLastUsed:52` literal Date | OK |
| `lastLoginAt` | User | **NOT TRACKED** — column doesn't exist on User entity | N/A |
| `deletedAt` | (none — uses hard delete) | N/A — no soft delete pattern | N/A |
| `audioUrl/audioGeneratedAt/audioVoice` | ChatMessage | `clearMessageAudio` uses explicit `null` | OK |
| `purgedAt` | ChatSession | `chat-purge.job.ts:137` raw `() => 'NOW()'` | OK |

---

## 5. Silent-Bug Summary Table (Severity Ranked)

| # | Location | Affected columns | Impact | Severity |
|---|---|---|---|---|
| **B1** | `user.repository.pg.ts:139-140` (`consumeResetTokenAndUpdatePassword`) | `reset_token`, `reset_token_expires` | Password-reset token can be **replayed** for full TTL after successful reset. Same root cause as fixed verifyEmail. | **HIGH** |
| **B2** | `user.repository.pg.ts:230-232` (`consumeEmailChangeToken`) | `pending_email`, `email_change_token`, `email_change_token_expiry` | Email-change token can be **replayed**; `pending_email` ghost persists post-consume, breaks SEC-HARDENING M13 hygiene. | **HIGH** |
| **B3** | `user.repository.pg.ts:115-116` (`updatePassword` via `ChangePasswordUseCase`) | `reset_token`, `reset_token_expires` | Voluntary password-change leaves stale reset-token rows uncleared. Lower severity (requires authenticated session), but breaks audit cleanliness + GDPR Art. 25 (data minimisation). | MEDIUM |

---

## 6. Recommended Remediation

### 6.1 Code fixes (3 files, identical 1-line edits)

```ts
// B1 — user.repository.pg.ts:139-140
- reset_token: undefined,
- reset_token_expires: undefined,
+ reset_token: () => 'NULL',
+ reset_token_expires: () => 'NULL',

// B2 — user.repository.pg.ts:230-232
- pending_email: undefined,
- email_change_token: undefined,
- email_change_token_expiry: undefined,
+ pending_email: () => 'NULL',
+ email_change_token: () => 'NULL',
+ email_change_token_expiry: () => 'NULL',

// B3 — user.repository.pg.ts:115-116
- reset_token: undefined,
- reset_token_expires: undefined,
+ reset_token: () => 'NULL',
+ reset_token_expires: () => 'NULL',
```

Note : `updatePassword` uses `repo.update(id, partialEntity)` which goes through
`createQueryBuilder().update().set()` internally. The raw-function pattern works
identically through this path.

### 6.2 Test fixes (mandatory — current tests freeze broken behavior)

- `tests/unit/auth/user-repository.test.ts:302-306` — update `consumeResetTokenAndUpdatePassword` assertion to verify each NULL-emitter (same shape as the existing verifyEmail test at lines 386-395).
- `tests/unit/auth/user-repository.test.ts:473-477` — same fix for `consumeEmailChangeToken`.
- `tests/unit/auth/user-repository.test.ts` for `updatePassword` (search around line 280, add if missing).

### 6.3 E2E regression — add 2 tests

- `tests/e2e/auth-reset-password.e2e.test.ts` : after successful reset, query the user row, assert `reset_token IS NULL AND reset_token_expires IS NULL`, then attempt to re-POST the same token → expect 400 "Invalid or expired reset token".
- `tests/e2e/auth-change-email.e2e.test.ts` : after successful email-change confirm, query the user row, assert `pending_email IS NULL AND email_change_token IS NULL`, then attempt to re-POST same token → expect 400.

The verifyEmail e2e at `tests/e2e/auth-verify-email.e2e.test.ts` already follows this pattern — copy-paste shape.

### 6.4 ESLint custom rule (preventive)

Add a new rule `no-typeorm-set-undefined` to
`tools/eslint-plugin-musaium-test-discipline/src/rules/`. Detection logic :

1. Match `CallExpression` whose callee is `MemberExpression` with property name `set`.
2. Walk **up** the chain — confirm the receiver is a `MemberExpression` chain that contains `.update(...)` (either `createQueryBuilder().update(Entity).set(...)` or `repo.update(criteria, ...)` via the EntityManager forwarder is harder to detect statically, so prefer to also flag `repo.update(...)` calls where the second argument is an `ObjectExpression`).
3. For each `Property` in the `ObjectExpression`, flag values whose **type** is `undefined` (literal) or which is `Identifier` referencing a variable with `T \| undefined` inferred type.
4. Auto-fix : `field: undefined` → `field: () => 'NULL'`.

Conservative variant : flag **any** `Property` with `Identifier: undefined` literal in a `.set(...)` call inside files matching `**/*.repository*.ts` (path-based scoping reduces false positives).

Wire into `museum-backend/.eslintrc.cjs` under the existing
`'musaium-test-discipline/'` namespace, severity `error`, with a brief
justification block in the README.

### 6.5 codemod (one-shot cleanup)

If maintainers prefer not to invest in custom AST rule, a small `jscodeshift`
or `ts-morph` codemod that scans for `.set({ ... })` Object literals
containing `: undefined` values and rewrites them to `() => 'NULL'` would
deterministically cleanse the 3 known sites plus future regressions, run
once and committed.

---

## 7. CLAUDE.md Update Recommendation

The current entry under **Pièges connus** correctly describes the mechanism
but cites only the verifyEmail incident. Suggest expansion :

> **TypeORM `.set({ field: undefined })` est silencieusement skip** —
> `UpdateQueryBuilder` ne génère PAS de `SET field = NULL` quand on passe
> `undefined`. **Affecte aussi `repo.update(criteria, partialEntity)` qui
> forwarde vers le même chemin interne (`EntityManager.update` →
> `QueryBuilder.update().set()`).** Use `() => 'NULL'` raw expression. Bug
> verifyEmail 2026-05 (fix commit `9d1e971a5`). Audit 2026-05-13 (F8) a
> trouvé 3 sites résiduels : `consumeResetTokenAndUpdatePassword`,
> `consumeEmailChangeToken`, `updatePassword` — voir
> `audit-2026-05-12/05-gaps/F8-typeorm-set-undefined-audit.md`.

---

## 8. Verification Ladder Used (UFR-013)

| Claim | Evidence |
|---|---|
| TypeORM silently skips `undefined` | Read `node_modules/typeorm/browser/query-builder/UpdateQueryBuilder.js:289-295` |
| `repo.update()` shares the same code path | Read `node_modules/typeorm/browser/entity-manager/EntityManager.js:343-361` |
| verifyEmail fix exists + commit identified | `git log -S "() => 'NULL'"` returns commit `9d1e971a5` w/ Bug 5 description |
| Existing tests freeze the broken contract for the 3 silent-bug sites | Read `tests/unit/auth/user-repository.test.ts:302-306, 473-477` |
| All other `.update().set()` sites are safe | Read each file at the documented line range |
| `clearMessageAudio` correct pattern uses `null` not `undefined` | Read `chat-repository-audio.ts:25-28` + matching test at `chat-repository-helpers.test.ts:117` |
| No `lastLoginAt` / `deletedAt` columns on User entity | Read `auth/domain/user/user.entity.ts` end-to-end (138 lines) |
