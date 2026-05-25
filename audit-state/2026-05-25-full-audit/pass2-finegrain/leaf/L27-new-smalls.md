# L27 — NEW V1.0.x small (smalls quick wins) — fine-grain re-audit

- **Scope**: `docs/ROADMAP_PRODUCT.md` section "NEW V1.0.x small (smalls quick wins)" (L303-318).
- **Branch / HEAD**: `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`.
- **Method**: re-derived from source from scratch (UFR-013), no trust in roadmap checkboxes. Each verdict confirmed by path:line.

| # | Item | Roadmap mark | VERDICT | Evidence |
|---|------|--------------|---------|----------|
| 1 | `SUPPORTED_LOCALES` dedup BE+FE | `[ ]` | **STILL-OPEN** | 2 independent defs: `museum-backend/src/shared/i18n/locale.ts:1` + `museum-frontend/shared/config/supportedLocales.ts:1`. `@musaium/shared` exports only `.` + `./observability` (`packages/musaium-shared/package.json`), no `i18n`/`locale` subpath. |
| 2 | `hashEmail` 32-bit fold byte-identical FE+web → shared | `[ ]` | **STILL-OPEN** | Duplicated, byte-identical impl: `museum-frontend/shared/observability/sentry-scrubber.ts:27-34` + `museum-web/src/lib/sentry-scrubber.ts:28-35` (both `0xdeadbeef` / `Math.imul(..., 2654435761)` / same return). Not extracted to shared package (only types are imported from `@musaium/shared/observability`). |
| 3 | Brevo unsubscribe one-click UX | `[ ]` | **STILL-OPEN** | Promise present `museum-web/src/dictionaries/en.json:340` + `fr.json:340` ("One-click unsubscribe" / "Désinscription en un clic"). NO backing: `brevo-email.service.ts:8-20` sends no `List-Unsubscribe` header; zero unsubscribe route in `museum-backend/src` (grep empty); no web/FE unsubscribe page. NOTE: roadmap cited `:334`, actual line is `:340` (dict shifted). |
| 4 | `SwipeableConversationCard.tsx:121-122` RTL right-side borders | `[ ]` | **STILL-OPEN** | File moved to `museum-frontend/features/conversation/ui/SwipeableConversationCard.tsx:121-122` — `borderTopRightRadius` / `borderBottomRightRadius` (physical right props). Delete action is `renderRightActions` (L87, mirrors to left under RTL) → rounds wrong edge in RTL. Violates CLAUDE.md RTL logical-side gotcha. Fix: logical `borderStartEndRadius`/`borderEndEndRadius` (or `*End*`). |
| 5 | `audit-factory-coverage.mjs` orphan — delete OR wire pre-push | `[ ]` | **STILL-OPEN (orphan confirmed)** | Exists `scripts/sentinels/audit-factory-coverage.mjs`. NOT in `package.json` scripts (no `sentinel:audit-factory`), NOT in `.husky/pre-commit` / `.husky/pre-push`, NOT in `sentinel-mirror.yml`. Only ref = a comment in `scripts/sentinels/screen-test-coverage.mjs:27`. |
| 6 | `metric-naming.mjs` duplicate root vs backend — consolidate | `[ ]` | **STILL-OPEN** | Still 2 copies: `scripts/sentinels/metric-naming.mjs` (221 LOC) + `museum-backend/scripts/sentinels/metric-naming.mjs` (145 LOC, diverged). `sentinel-mirror.yml:127` runs root copy; `museum-backend/package.json:23` runs backend copy. Not consolidated. |
| 7 | `workspace-links.mjs` not in CI mirror | `[ ]` | **STILL-OPEN** | Wired locally: `.husky/pre-commit:125` (Gate 6) + `.husky/post-merge:23` + `package.json:21`. But absent from `.github/workflows/sentinel-mirror.yml` (no `workspace-links` ref). Server-side mirror gap → `--no-verify` bypass of this gate uncaught. |
| 8 | `reportUnusedDisableDirectives` set in BE/FE/Web configs | `[ ]` | **STILL-OPEN** | BE `museum-backend/eslint.config.mjs` + Web `museum-web/eslint.config.mjs`: no `linterOptions.reportUnusedDisableDirectives` at all. FE `museum-frontend/eslint.config.mjs:202-203` sets it to `'off'` for test files only (not explicitly enabled globally). Item asks explicit set in all 3 — not done. |
| 9 | `AUDIT_AUTH_LOGIN_FAILED` raw email metadata | `[x]` DONE #294 | **DONE-VERIFIED** | `login-handler.helpers.ts:63-68`: `emailDomain = extractEmailDomain(email)` → `metadata: { emailDomain }`. No raw email. Checkbox correct. |
| 10 | EXPORT_PSEUDONYM_SALT mandatory in prod | `[x]` DONE #293 | **DONE-VERIFIED** | `env.production-validation.ts:170-171`: `required('EXPORT_PSEUDONYM_SALT', ...)` + `assertSecretLength` (≥32). Historical fallback literal removed (comment L159-160). Drift guard L176-179. Checkbox correct. |
| 11 | Admin `DeleteUserUseCase` upgrade to hard-delete | `[ ]` | **STILL-OPEN** | `museum-backend/src/modules/admin/useCase/users/deleteUser.useCase.ts:49` → `this.repository.softDeleteUser(...)`. Repo `admin.repository.pg.ts:164-167` sets `user.deletedAt = new Date()` — soft-delete only. Art.17 admin path incomplete. |
| 12 | `AUDIT_ACCOUNT_DELETED` log AFTER cleanup | `[ ]` | **STILL-OPEN (quick-win)** | `auth-profile.route.ts:151-159` emits audit log, THEN `deleteAccountUseCase.execute(user.id)` at L160. Audit emitted BEFORE cleanup → lies if `execute` throws. Fix: move `auditService.log({...})` to after the `await`. |
| 13 | `promtail-config.yml` add PII redaction stages | `[ ]` | **STILL-OPEN** | `museum-backend/deploy/promtail-config.yml` (28 lines) `pipeline_stages` L19-28 = only `json:` extract + `labels:`. Zero `regex`/`replace`/redact stage. |
| 14 | `shouldDropBreadcrumb` add verify-email\|magic-link\|confirm-email-change + scrubUrl on breadcrumb.data.url | `[ ]` | **STILL-OPEN (R1/R2 addressed a DIFFERENT gap)** | Impl `packages/musaium-shared/src/observability/sentry-scrubber.ts`. `SENSITIVE_BREADCRUMB_PATHS` (L44-49) = only `/auth/login`,`/register`,`/reset-password`,`/change-password` — NO verify-email/magic-link/confirm-email-change. `shouldDropBreadcrumb` (L238-243) only drops on path match; does NOT call `scrubUrl(breadcrumb.data.url)`. R1 (L24-27) extended **query-key** set (`code/state/email/phone`); R2 (L212-232) added scrubUrl on `request.url` (L171) + tags (L228) — neither touches breadcrumb.data.url nor the path list. |

## Summary

- **DONE-VERIFIED (checkboxes correct, no action)**: #9 AUDIT_AUTH_LOGIN_FAILED, #10 EXPORT_PSEUDONYM_SALT.
- **STILL-OPEN (12)**: #1 SUPPORTED_LOCALES, #2 hashEmail, #3 Brevo unsubscribe, #4 RTL borders, #5 audit-factory-coverage orphan, #6 metric-naming dup, #7 workspace-links CI mirror, #8 reportUnusedDisableDirectives, #11 DeleteUserUseCase hard-delete, #12 AUDIT_ACCOUNT_DELETED ordering, #13 promtail PII, #14 shouldDropBreadcrumb paths.
- **No items to flip to [x]** — both already-checked items verify true; all unchecked items remain genuinely open.

## Top quick-wins (low effort, high correctness/compliance value)

1. **#12 AUDIT_ACCOUNT_DELETED ordering** — 1-line move of `auditService.log` to after `deleteAccountUseCase.execute` (`auth-profile.route.ts:151-160`). Audit-integrity bug.
2. **#4 RTL borders** — 2-line swap to logical `borderStartEnd/EndEndRadius` (`SwipeableConversationCard.tsx:121-122`). Matches existing RTL doctrine.
3. **#5 audit-factory-coverage** — decide delete vs wire; pure orphan, zero risk.
4. **#7 workspace-links CI mirror** — add one gate to `sentinel-mirror.yml` (script already exists).
5. **#3 Brevo unsubscribe** — either ship a List-Unsubscribe header / endpoint, OR (UFR-013) soften the dictionary promise that isn't backed.

## Notes / caveats

- Item #14 is the trap: R1/R2 (2026-05-21) hardened the *query-key* set and *tag/request.url* scrubbing, which could read as "breadcrumb done" — it is NOT. The two literal asks (breadcrumb path list + scrubUrl on breadcrumb.data.url) are untouched. Verdict STILL-OPEN, not PARTIAL-credit-DONE.
- Item #8 nuance: FE config explicitly disables the directive for tests (`:203`); not the same as enabling it project-wide. BE/Web have nothing.
- Line-number drift vs roadmap: #3 dict at `:340` not `:334`; #4 file path `features/conversation/` (singular) not `features/conversations/`.
