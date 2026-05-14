/**
 * Mutation-coverage tests for UpdateTicketStatusUseCase.
 *
 * Targets 10 Stryker survivors in
 * `src/modules/support/useCase/ticket-admin/updateTicketStatus.useCase.ts`:
 *  - L30 StringLiteral (invalid-status badRequest message body / interpolation)  x2
 *  - L33 StringLiteral (invalid-priority badRequest message)                     x1
 *  - L37 StringLiteral (no-fields-provided badRequest message)                   x1
 *  - L60 ConditionalExpression `input.assignedTo !== undefined` → false          x1
 *  - L60 ConditionalExpression `input.assignedTo !== undefined` → true           x1
 *  - L60 LogicalOperator       `&&` → `||`                                       x1
 *  - L60 ConditionalExpression (truthiness on RHS) → true                        x1
 *  - L60 EqualityOperator      `!==` → `===`                                     x1
 *  - L60 ObjectLiteral         `{ assignedTo: input.assignedTo }` → `{}`         x1
 *
 * Strategy:
 *  - Assert the *exact* message text on every badRequest path so the
 *    StringLiteral mutants (empty-string / empty-template-literal replacements)
 *    no longer survive.
 *  - For the L60 audit-metadata spread, use exact `toEqual` on `metadata` AND
 *    `Object.keys(metadata)` to distinguish `{}` from `{ assignedTo: undefined }`
 *    (which `toEqual` would otherwise treat as equivalent).
 */

import { UpdateTicketStatusUseCase } from '@modules/support/useCase/ticket-admin/updateTicketStatus.useCase';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@modules/support/domain/ticket/support.types';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';
import { makeTicket } from 'tests/helpers/support/ticket.fixtures';

// Mock the audit module — the use case imports the singleton directly.
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_ADMIN_TICKET_UPDATED: 'ADMIN_TICKET_UPDATED',
}));

describe('UpdateTicketStatusUseCase — mutation coverage', () => {
  let useCase: UpdateTicketStatusUseCase;
  let repo: InMemorySupportRepository;
  let ticketId: string;

  beforeEach(() => {
    repo = new InMemorySupportRepository();
    useCase = new UpdateTicketStatusUseCase(repo);

    const seeded = repo.seed(
      makeTicket({
        id: 'ticket-upd-mut-1',
        userId: 10,
        subject: 'Update test',
        description: 'Testing updates',
        status: 'open',
        priority: 'medium',
      }),
    );
    ticketId = seeded.id;
    jest.clearAllMocks();
  });

  describe('badRequest message text (L30, L33, L37 StringLiteral)', () => {
    it('uses the exact "status must be one of: <list>" message for invalid status', async () => {
      const expectedMessage = `status must be one of: ${TICKET_STATUSES.join(', ')}`;
      // Sanity-check that the helper actually produced a non-empty list — protects
      // against accidental future change to TICKET_STATUSES being emptied.
      expect(expectedMessage).toBe('status must be one of: open, in_progress, resolved, closed');

      await expect(
        useCase.execute({ ticketId, status: 'not-a-real-status', actorId: 1 }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expectedMessage,
      });
    });

    it('uses the exact "priority must be one of: <list>" message for invalid priority', async () => {
      const expectedMessage = `priority must be one of: ${TICKET_PRIORITIES.join(', ')}`;
      expect(expectedMessage).toBe('priority must be one of: low, medium, high');

      await expect(
        useCase.execute({ ticketId, priority: 'urgent', actorId: 1 }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expectedMessage,
      });
    });

    it('uses the exact "At least one of …" message when no fields are provided', async () => {
      await expect(useCase.execute({ ticketId, actorId: 1 })).rejects.toMatchObject({
        statusCode: 400,
        message: 'At least one of status, priority, or assignedTo must be provided',
      });
    });
  });

  describe('audit metadata.assignedTo spread (L60)', () => {
    it('OMITS assignedTo key when input.assignedTo is undefined (status-only update)', async () => {
      const { auditService } = jest.requireMock('@shared/audit');

      await useCase.execute({ ticketId, status: 'closed', actorId: 7 });

      expect(auditService.log).toHaveBeenCalledTimes(1);
      const logArg = auditService.log.mock.calls[0][0];
      // `toEqual` would treat `{ status: 'closed', assignedTo: undefined }` as
      // equal to `{ status: 'closed' }`; use Object.keys to lock the *presence*
      // of the key, killing the "always-spread" mutants.
      expect(Object.keys(logArg.metadata).sort()).toEqual(['status']);
      expect(Object.prototype.hasOwnProperty.call(logArg.metadata, 'assignedTo')).toBe(false);
      expect(logArg.metadata).toEqual({ status: 'closed' });
    });

    it('OMITS assignedTo key when input.assignedTo is undefined (priority-only update)', async () => {
      const { auditService } = jest.requireMock('@shared/audit');

      await useCase.execute({ ticketId, priority: 'high', actorId: 1 });

      const logArg = auditService.log.mock.calls[0][0];
      expect(Object.keys(logArg.metadata).sort()).toEqual(['priority']);
      expect(Object.prototype.hasOwnProperty.call(logArg.metadata, 'assignedTo')).toBe(false);
      expect(logArg.metadata).toEqual({ priority: 'high' });
    });

    it('INCLUDES assignedTo with the numeric value when provided', async () => {
      const { auditService } = jest.requireMock('@shared/audit');

      await useCase.execute({
        ticketId,
        assignedTo: 42,
        actorId: 3,
        ip: '10.0.0.2',
        requestId: 'req-assigned',
      });

      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'ADMIN_TICKET_UPDATED',
        actorType: 'user',
        actorId: 3,
        targetType: 'support_ticket',
        targetId: ticketId,
        metadata: { assignedTo: 42 },
        ip: '10.0.0.2',
        requestId: 'req-assigned',
      });
      const logArg = auditService.log.mock.calls[0][0];
      expect(Object.keys(logArg.metadata).sort()).toEqual(['assignedTo']);
    });

    it('INCLUDES assignedTo: null when explicitly unassigning (null is not undefined)', async () => {
      const { auditService } = jest.requireMock('@shared/audit');

      // First assign so the unassign mutation is meaningful at the repo level.
      await useCase.execute({ ticketId, assignedTo: 42, actorId: 1 });
      jest.clearAllMocks();

      await useCase.execute({
        ticketId,
        assignedTo: null,
        actorId: 4,
      });

      expect(auditService.log).toHaveBeenCalledTimes(1);
      const logArg = auditService.log.mock.calls[0][0];
      expect(logArg.metadata).toEqual({ assignedTo: null });
      expect(Object.keys(logArg.metadata).sort()).toEqual(['assignedTo']);
      expect(logArg.metadata.assignedTo).toBeNull();
    });

    it('INCLUDES all three keys when status, priority, and assignedTo are all provided', async () => {
      const { auditService } = jest.requireMock('@shared/audit');

      await useCase.execute({
        ticketId,
        status: 'resolved',
        priority: 'low',
        assignedTo: 5,
        actorId: 1,
      });

      const logArg = auditService.log.mock.calls[0][0];
      expect(logArg.metadata).toEqual({
        status: 'resolved',
        priority: 'low',
        assignedTo: 5,
      });
      expect(Object.keys(logArg.metadata).sort()).toEqual(['assignedTo', 'priority', 'status']);
    });
  });
});
