import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '../../..');

const TWELVE_SITES: readonly string[] = [
  'src/modules/admin/useCase/users/suspendUser.useCase.ts',
  'src/modules/admin/useCase/users/unsuspendUser.useCase.ts',
  'src/modules/admin/useCase/users/changeUserRole.useCase.ts',
  'src/modules/admin/useCase/users/changeUserTier.useCase.ts',
  'src/modules/admin/useCase/users/deleteUser.useCase.ts',
  'src/modules/admin/useCase/reports/resolveReport.useCase.ts',
  'src/modules/admin/useCase/export/exportReviews.useCase.ts',
  'src/modules/admin/useCase/export/exportSupportTickets.useCase.ts',
  'src/modules/admin/useCase/export/exportChatSessions.useCase.ts',
  'src/modules/support/useCase/ticket-user/createTicket.useCase.ts',
  'src/modules/support/useCase/ticket-admin/updateTicketStatus.useCase.ts',
  'src/modules/review/useCase/moderation/moderateReview.useCase.ts',
];

describe('PR-7 sentinel — 12 enumerated sites no longer carry the inline pattern', () => {
  it.each(TWELVE_SITES)("%s does NOT contain the inline literal `actorType: 'user'`", (relPath) => {
    const absPath = resolve(BACKEND_ROOT, relPath);
    const content = readFileSync(absPath, 'utf8');

    expect(content).not.toMatch(/actorType\s*:\s*['"]user['"]/);
  });

  it.each(TWELVE_SITES)(
    '%s does NOT contain the inline pattern `ip: input.ip ?? null`',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

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

    const matches = content.match(/\.logActorAction\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it.each(TWELVE_SITES)(
    '%s no longer calls the bare `.log(` audit method (only `.logActorAction(`)',
    (relPath) => {
      const absPath = resolve(BACKEND_ROOT, relPath);
      const content = readFileSync(absPath, 'utf8');

      expect(content).not.toMatch(/\b(auditService|this\.audit)\.log\(/);
    },
  );
});
