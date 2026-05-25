# L05 — I-SEC5/6/7/8 fine-grain audit (READ-ONLY, fresh-context UFR-022)

- **Branch/HEAD**: `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`
- **Scope**: P0.I.A items I-SEC5, I-SEC6, I-SEC7, I-SEC8 from `docs/ROADMAP_PRODUCT.md:230-233`
- **Principle**: zero trust on prior markers/ADRs — every claim re-derived from code (path:line). Markers in the roadmap *contradict each other* (line 70 vs line 231 on I-SEC6) so independent derivation was mandatory.

Verification ladder per item = `Read` + `Grep` of the live source on `dev`. No commands beyond grep/read (read-only mandate).

---

## I-SEC5 — `EXPORT_PSEUDONYM_SALT` gated in prod ≥32 chars

**VERDICT: TRUE / DONE — claim accurate.**

- `museum-backend/src/config/env.production-validation.ts:169-181` `validateExportPseudonymSalt()`:
  - `:170` `required('EXPORT_PSEUDONYM_SALT', process.env.EXPORT_PSEUDONYM_SALT)` → throws `Missing required environment variable` if absent/blank (`:3-8`).
  - `:171` `assertSecretLength('EXPORT_PSEUDONYM_SALT', salt)` → throws if `< 32` (`MIN_JWT_SECRET_LENGTH = 32`, `:11`, `:13-20`).
  - `:176-180` extra **drift guard**: throws if `env.exportPseudonymSalt !== salt` (parsed-vs-raw wiring drift) — stronger than the marker claims.
- Wired into the prod path: `validateProductionEnv()` calls it `:162`, and `validateProductionEnv` is the prod-only gate (`:103-107` docstring: "Called from env.ts only when NODE_ENV === 'production'").
- No literal fallback (`'musaium-admin-export-v1'`) anywhere in this file. (Original audit text described that fallback; it is gone.)

**Severity**: N/A (resolved). The historical risk (reversible GDPR pseudonymisation via a public literal salt → dictionary attack on exported user identifiers) was real; the gate closes it for prod.

**Divergence vs marker**: none. Roadmap `:230` cites `env.production-validation.ts:170` — exact line confirmed (`:170` is the `required(...)` line). DONE-DEV marker is honest.

**Debt**: none for V1. (Salt rotation runbook referenced `docs/SECURITY.md#export-salt-rotation` — not verified for existence; out of scope here, but a candidate doc-anchor check.)

---

## I-SEC6 — Login sliding-window Redis key: plaintext email or SHA-1?

**VERDICT: marker line 231 is FALSE/STALE; line 70 is CORRECT. The "live PII-leak" described in the roadmap is NOT real.**

The two markers contradict:
- `docs/ROADMAP_PRODUCT.md:231` (line text) asserts: *"Login sliding-window Redis key = email plaintext `login-attempts:<raw-email>` … PII in keyspace/AOF 10min"* citing `login-rate-limiter.ts:96`.
- `docs/ROADMAP_PRODUCT.md:70` asserts the opposite: *"`login-rate-limiter.ts:100` hash déjà l'email SHA-1 (claim « plaintext » RÉFUTÉ)."*

**Code is unambiguous — BOTH keys are SHA-1 hashed:**
- `museum-backend/src/modules/auth/useCase/session/login-rate-limiter.ts:100-102` — `hashEmailForKey(email) = createHash('sha1').update(email).digest('hex')`.
- `:104` `slidingRedisKey = `${KEY_PREFIX}${hashEmailForKey(email)}`` — **sliding window key is hashed.**
- `:106` `lockoutRedisKey = `${LOCKOUT_KEY_PREFIX}${hashEmailForKey(email)}`` — lockout key also hashed (single DRY helper, `:96-98` comment).
- `:230` the sliding-window Redis write uses `slidingRedisKey(key)`; `:294` clear uses same. There is **no `login-attempts:<raw-email>`** path. The local in-memory `InMemoryBucketStore` is keyed by `normalize(email)` (plaintext) **but that is process memory, never Redis/AOF** (`:71-77`, `:116-119`).

So the marker's own line-231 text ("plaintext", "PII in keyspace/AOF") is **refuted by the code**. The line-70 correction block is the accurate one. The roadmap is internally inconsistent (a STALE original-audit sentence left verbatim alongside its refutation) — should be cleaned.

**Severity (real)**: NONE / not a vulnerability. (SHA-1-of-email is not a cryptographic-strength anonymiser — emails are low-entropy and rainbow-table-able — but the spec goal here is "raw identifiers don't appear in Redis log dumps / keyspace dumps", which is met. The `eslint-disable sonarjs/hashing` comment `:101` correctly scopes it as a non-cryptographic key identifier.)

**Divergence vs marker**: line 231 (the table row text) is WRONG/STALE; line 70 (correction block) is RIGHT. Net: the item is a false-positive "live bug".

**Debt**: DOC — roadmap `:231` row text still describes a non-existent plaintext leak. Should be rewritten to match the line-70 truth (the marker block itself flags this at `:87` "I-SEC4/I-SEC6 textes 'live' à réécrire"). No code debt.

---

## I-SEC7 — TOTP replay (markUsed persistence + atomicity) + access-token denylist

**VERDICT: PARTIALLY TRUE — replay protection EXISTS and persists, denylist EXISTS; but the step compare-and-set is NOT atomic (read-then-write TOCTOU). Functionally adequate for the threat model; one residual race-window debt.**

### Persistence (claim: `markUsed` persists) — TRUE
- `museum-backend/src/modules/auth/adapters/secondary/pg/totp-secret.repository.pg.ts:60-62` `markUsed()` does `repo.update({ userId }, { lastUsedAt: at, lastUsedStep: String(step) })` → persists `last_used_step` (bigint, `String(step)` to dodge the TypeORM `set({undefined})` silent-skip — cited `:57-58`, matches CLAUDE.md gotcha).
- Step column: `museum-backend/src/modules/auth/domain/totp/totp-secret.entity.ts:67-68` `last_used_step bigint nullable`.
- Replay check enforced at BOTH verify and challenge:
  - `verifyMfa.useCase.ts:55-62` — `lastStep = Number(row.lastUsedStep)`; reject if `result.step <= lastStep`.
  - `challengeMfa.useCase.ts:68-75` — identical guard; same opaque `INVALID_MFA_CODE` code so replay ≠ wrong-code (timing/oracle defense).
  - `recoveryMfa.useCase.ts:74` also `markUsed`.
- Step derivation: `totpService.ts:51-72` `verifyTotpCode` returns `{ step: floor(now/30)+delta }` (WINDOW=1, ±1 step). RFC 6238 §5.2 "MUST NOT accept second attempt" implemented via monotonic step ledger. Correct.

### Atomicity (the question the brief flags) — **NOT compare-and-set; TOCTOU window exists**
- The flow in `verifyMfa`/`challengeMfa` is: (1) `findByUserId` reads `lastUsedStep`, (2) compare in JS, (3) `markUsed` does an **unconditional** `repo.update({ userId }, {...})`.
- `markUsed` (`totp-secret.repository.pg.ts:60-62`) has **no `WHERE last_used_step < :step`** guard and runs in **no transaction / no row lock**. Contrast `markEnrolled` (`:44-51`) which IS conditional (`WHERE ... enrolled_at IS NULL`) — proving the conditional-update pattern was available and deliberately used elsewhere but not here.
- Consequence: two concurrent requests presenting the **same** valid code can both read `lastUsedStep=null` (or the same old step), both pass the JS compare, both succeed, both write. Classic check-then-act race → the "reject the second use" guarantee is defeated under a concurrent (not sequential) replay.
- Mitigants that shrink (not close) the window: the route rate-limits by user id (`challengeMfa` docstring `:16` "5 tries / 15 min" via `mfa.route.ts`), and the attacker needs the live code within its ±60s validity. So practical exploitability is low but non-zero (e.g. attacker fires two parallel requests with a single phished code).

### Access-token denylist — TRUE / present
- `museum-backend/src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts` — prefix `denylist:access:` (`:8`); `add()` uses atomic `SET ... EX ... NX` (`:70`, no separate EXPIRE race); `has()` (`:76-86`) **fail-OPEN** on Redis error (`:84`, documented defense-in-depth, primary identity still gates). jti logged only as SHA-256-first-8 (`:21-26`, `:97`) — no PII/jti leak. Matches the marker (ADR-064, prefix `denylist:access:`).

**Severity (real)**:
- Replay persistence + denylist: resolved, MEDIUM-risk historical issue now mitigated.
- The non-atomic markUsed: **LOW**. True compare-and-set would be the textbook fix (conditional UPDATE `WHERE last_used_step IS NULL OR last_used_step < :step`, then re-check `affected`), but concurrent same-code replay is a narrow window gated by per-user rate limiting and code TTL. Not a V1 launch blocker; worth a debt ticket.

**Divergence vs marker**: marker `:232` (DONE-DEV) claims "TOTP replay … traités" and cites `totp-secret.repository.pg.ts:60` — accurate that persistence exists. Marker does NOT acknowledge the read-then-write TOCTOU. Minor under-statement, not a lie.

**Debt**: `TD-SEC-TOTP-ATOMIC-01` (new) — convert `markUsed` to a conditional UPDATE (compare-and-set) + re-check affected rows, OR wrap verify-compare-markUsed in a SERIALIZABLE / `SELECT ... FOR UPDATE` transaction, to close the concurrent-replay window. LOW.

---

## I-SEC8 — `artwork_knowledge` has no `museum_id` → cross-tenant bleed?

**VERDICT (severity trance): the cross-tenant *security* claim is a FALSE FRAMING — there is no tenant boundary in the data model to leak across. Real severity = LOW (UX/coherence), NOT CRITICAL. ADR-061 is correct and consistent with the code. The roadmap `:233` "❌ OPEN / seul OPEN sécurité critique restant" is OVER-STATED.**

### What the code actually shows
1. **No tenant column.** `artwork-knowledge.entity.ts:14-68` — columns: title, artist, period, technique, description, historicalContext, dimensions, currentLocation, sourceUrls, confidence, needsReview, locale, **roomId** (intra-museum prep, `:54-61`), createdAt, updatedAt. **No `museum_id`, no `userId`, no tenant/owner column whatsoever** (grep for `museumId|userId|private` in the entity = zero hits). Unique index is global: `[title, artist, locale]` (`:11-13`).
2. **Global public-catalogue provenance.** Populated by scrape→classify→store: `extraction-job.service.ts:30,62,110` (`scraper.scrape(url)` → classify → `artworkRepo.upsertFromClassification`). Dedup by `(title, artist, locale)` (`typeorm-artwork-knowledge.repo.ts:10-16,40`). Source content treated as untrusted (`content-classifier.service.ts:64,85` `<scraped_content>`). It is a **single global public-knowledge catalogue** (Wikidata/web), not a per-museum private store.
3. **`findById` has no tenant filter — and conceptually cannot have one.** `typeorm-artwork-knowledge.repo.ts:19-21` `findOne({ where: { id } })`. There is no tenant dimension to filter on.
4. **Pipeline call site.** `prepare-message.pipeline.ts:350-364` `resolveCurrentArtwork(session)` → `repo.findById(session.currentArtworkId)` (line 357), returns `{ title, roomId }`. `currentArtworkId` is **client-supplied**, validated only as UUIDv4 shape (`chat-session.schemas.ts:181` `optionalNullableUuidV4`); no ownership/tenant check (and none possible).
5. **Where the title lands.** `llm-prompt-builder.ts:72,75` renders `[CURRENT ARTWORK]\ntitle: ${sanitizePromptInput(currentArtwork.title)}` inside an explicit `[END OF CURRENT ARTWORK]` sub-fence (`:75`) and before the `[END OF SYSTEM INSTRUCTIONS]` boundary (`:173`). `sanitizePromptInput()` (Unicode-normalise + zero-width strip + truncate) applied (`:72`).

### Severity reasoning (the CRITICAL-vs-LOW debate, decided by code)
- **No confidentiality boundary is crossed.** A client setting `currentArtworkId` to *any* catalogue row affects **only their own session's prompt**. No other user's data, no other "museum's private knowledge" is disclosed — because there is no per-museum private knowledge in this table. The classic cross-tenant/IDOR severity requires victim data on the other side of the reference; here every row is public scraped content with no owner.
- **No new exfiltration channel.** The user can already type any artwork title into their own message; surfacing a catalogue title in their own prompt adds nothing exfiltrable.
- **Prompt-injection via adversarial title** is the only non-trivial vector, and it is mitigated by `sanitizePromptInput()` + structural isolation (`[END OF SYSTEM INSTRUCTIONS]`) — the documented defense-in-depth (CLAUDE.md § AI Safety). No concrete bypass demonstrated.
- Residual = **UX/coherence** (a user could anchor their own session to an irrelevant title) — LOW.

So I independently reach the **LOW** classification, matching ADR-061 (`docs/adr/ADR-061-...md:26,30-35`) — and I verified each ADR factual claim against code rather than trusting it. The roadmap line-87 marker block ("I-SEC8 reclassé CRITIQUE→LOW … ADR-061 cohérent") is the honest reading; the line-233 table row ("seul OPEN sécurité critique restant") is **stale/over-stated** and contradicts the same document's correction block.

**Divergence vs marker**: the `:233` row text overstates severity (CRITICAL/OPEN) and frames it as a tenant leak; the `:87` block + ADR-061 correctly downgrade to LOW (documentation-only, no code). Roadmap is internally inconsistent again.

**Debt**:
- `TD-SEC-MULTI-TENANT-01` (already named in ADR-061 §Consequences / `docs/TECH_DEBT.md` placeholder) — IF V2 adds a per-museum **private** knowledge store, tenant scoping becomes a real requirement at that point. Verify the TECH_DEBT placeholder actually exists (ADR claims it does; not re-verified here).
- DOC — reconcile roadmap `:233` row with the `:87`/ADR-061 LOW classification (the row should be marked LOW/by-design, not "❌ critical OPEN").
- Optional hardening (not required V1): validate `currentArtworkId` resolves to an existing row before persisting (currently shape-only), per ADR-061 §Negative.

---

## Summary table

| Item | Verdict | Real severity | Marker accurate? |
|---|---|---|---|
| I-SEC5 | DONE — salt required + ≥32 + drift guard (`env.production-validation.ts:169-181`) | resolved | yes (`:230`) |
| I-SEC6 | FALSE-POSITIVE "live bug" — both Redis keys SHA-1 hashed (`login-rate-limiter.ts:100-106`) | none | line 70 right, line 231 WRONG/STALE |
| I-SEC7 | Replay-ledger persists + denylist present; but `markUsed` is NOT compare-and-set → narrow concurrent-replay TOCTOU | LOW residual | marker right on existence, silent on TOCTOU |
| I-SEC8 | No tenant column exists; global public scraped catalogue; self-session-only | LOW (UX), NOT critical | line 87/ADR-061 right; line 233 OVER-STATED |

**Honesty note (UFR-013)**: all path:line refs above were opened and read on `dev` @ `1fb32f5ba`. Not verified (out of read-only scope / not opened): existence of `docs/SECURITY.md#export-salt-rotation` anchor, `mfa.route.ts` rate-limit numbers (taken from challengeMfa docstring `:16`), and the `TD-SEC-MULTI-TENANT-01` placeholder line in `docs/TECH_DEBT.md`.
