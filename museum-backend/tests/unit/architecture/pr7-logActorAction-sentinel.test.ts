/**
 * UFR-022 red phase — PR-7 sweep sentinel.
 * RUN_ID: 2026-05-23-pr-7-logActorAction.
 *
 * Repo-structural assertion (NOT behaviour). Locks AC2/AC3/AC11 from spec §7
 * + NFR-9: after green sweeps the 12 useCases, the inline `actorType:'user'`
 * + inline `ip: input.ip ?? null` patterns must not survive in any of the
 * 12 enumerated files, and each migrated useCase must call `.logActorAction(`.
 *
 * Pre-green: this test FAILS — there are currently 12 inline `actorType: 'user'`
 * occurrences inside these files and zero `.logActorAction(` call sites
 * (verified via `Read` 2026-05-23).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * `red-test-manifest.json`. Green phase MUST NOT modify it.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-7-logActorAction/spec.md §6 (12 sites table) §7 (AC2,AC3,AC11)
 *   .claude/skills/team/team-state/2026-05-23-pr-7-logActorAction/design.md §2.10 (sentinel design)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = museum-backend/tests/unit/architecture
// ../../..  = museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');

/**
 * The 12 sweep targets (spec §6). Paths are relative to museum-backend/ so
 * the assertion is portable across worktrees.
 */
const TWELVE_SITES: readonly string[] = [
  // admin/users (5 sites)
  'src/modules/admin/useCase/users/suspendUser.useCase.ts',
  'src/modules/admin/useCase/users/unsuspendUser.useCase.ts',
  'src/modules/admin/useCase/users/changeUserRole.useCase.ts',
  'src/modules/admin/useCase/users/changeUserTier.useCase.ts',
  'src/modules/admin/useCase/users/deleteUser.useCase.ts',
  // admin/reports (1 site)
  'src/modules/admin/useCase/reports/resolveReport.useCase.ts',
  // admin/export (3 sites — DI ExportAuditService, no ip/requestId/targetType)
  'src/modules/admin/useCase/export/exportReviews.useCase.ts',
  'src/modules/admin/useCase/export/exportSupportTickets.useCase.ts',
  'src/modules/admin/useCase/export/exportChatSessions.useCase.ts',
  // support (2 sites)
  'src/modules/support/useCase/ticket-user/createTicket.useCase.ts',
  'src/modules/support/useCase/ticket-admin/updateTicketStatus.useCase.ts',
  // review (1 site — DI Pick<AuditService>)
  'src/modules/review/useCase/moderation/moderateReview.useCase.ts',
];

describe('PR-7 sentinel — 12 enumerated sites no longer carry the inline pattern', () => {
  it.each(TWELVE_SITES)("%s does NOT contain the inline literal `actorType: 'user'`", (relPath) => {
    const absPath = resolve(BACKEND_ROOT, relPath);
    const content = readFileSync(absPath, 'utf8');

    // Tolerant on whitespace around the colon — matches both
    //   actorType: 'user'    (formatter standard)
    //   actorType:'user'     (rare, but defensible)
    // Quote style: both single & double quotes covered for safety.
    expect(content).not.toMatch(/actorType\s*:\s*['"]user['"]/);
  });

  it.each(TWELVE_SITES)(
    '%s does NOT contain the inline pattern `ip: input.ip ?? null`',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // The helper is responsible for the `?? null` coercion (design §2.4).
      // After sweep, callers pass `ip: input.ip` (or omit it for export sites).
      expect(content).not.toMatch(/ip\s*:\s*input\.ip\s*\?\?\s*null/);
    },
  );

  it.each(TWELVE_SITES)(
    '%s does NOT contain the inline pattern `requestId: input.requestId ?? null`',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).not.toMatch(/requestId\s*:\s*input\.requestId\s*\?\?\s*null/);
    },
  );

  it.each(TWELVE_SITES)('%s calls `.logActorAction(` at least once', (relPath) => {
    const absPath = resolve(BACKEND_ROOT, relPath);
    const content = readFileSync(absPath, 'utf8');

    // Match either `auditService.logActorAction(` or `this.audit.logActorAction(`.
    // Avoid matching the interface declaration in the 3 ExportAuditService files
    // by requiring a `.` immediately before (interface decl is on its own line
    // without a leading `.`).
    const matches = content.match(/\.logActorAction\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it.each(TWELVE_SITES)(
    '%s no longer calls the bare `.log(` audit method (only `.logActorAction(`)',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      // Forbid `auditService.log(` and `this.audit.log(` call sites — the
      // sweep retargets every one to `.logActorAction(`. The 3 export use
      // cases keep `log(entry: AuditLogEntry): Promise<void>;` in their
      // `ExportAuditService` interface declaration (design §2.6.1) — that
      // shape has a colon directly after `log`, NOT a paren, so it is NOT
      // matched by `\.log\(`. The interface line `log(entry: …): …` has no
      // leading `.` so it's safe.
      expect(content).not.toMatch(/\b(auditService|this\.audit)\.log\(/);
    },
  );
});
