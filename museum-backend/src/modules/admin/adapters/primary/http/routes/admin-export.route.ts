import { Router, type Request, type Response } from 'express';

import {
  exportKindParamSchema,
  exportQuerySchema,
} from '@modules/admin/adapters/primary/http/schemas/admin-export.schemas';
import {
  getExportChatSessionsUseCase,
  getExportReviewsUseCase,
  getExportSupportTicketsUseCase,
} from '@modules/admin/useCase/export/composition';
import { writeBomHeader, writeCsvRow } from '@shared/csv/csv-writer';
import { badRequest, forbidden } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { requireRole } from '@shared/middleware/require-role.middleware';

import type { ExportActorRole } from '@modules/admin/domain/export/csv-export.types';

/**
 * Admin CSV export — sessions / reviews / tickets.
 * Pipeline: isAuthenticated → requireRole(admin, museum_manager) → :kind enum
 * validate → use case (awaits audit row BEFORE returning stream, N6/AC10) →
 * BOM + header + data rows. Use case throws 403 for Q1 BLOCKER (manager/admin
 * on reviews/tickets) and R9 NO_MUSEUM_ASSIGNED.
 */
const adminExportRouter: Router = Router();

const SESSIONS_HEADERS = [
  'id',
  'user_id',
  'museum_id',
  'started_at',
  'ended_at',
  'message_count',
  'locale',
] as const;

const REVIEWS_HEADERS = [
  'id',
  'user_id_pseudonym',
  'user_name',
  'rating',
  'comment',
  'status',
  'created_at',
] as const;

const TICKETS_HEADERS = [
  'id',
  'user_email_pseudonym',
  'category',
  'status',
  'priority',
  'subject',
  'assigned_to',
  'created_at',
  'updated_at',
] as const;

/** R1 / R13 / N10 — standardised CSV download response headers. */
function setCsvHeaders(res: Response, kind: 'sessions' | 'reviews' | 'tickets'): void {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-${date}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
}

function toRecord(headers: readonly string[], row: object): Record<string, string> {
  const out: Record<string, string> = {};
  const indexed = row as Record<string, unknown>;
  for (const key of headers) {
    out[key] = coerceCell(indexed[key]);
  }
  return out;
}

/** Collapses objects/arrays/nullish to empty so DTO leaks can't render `[object Object]`. */
function coerceCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function resolveActor(req: Request): {
  actorId: number;
  actorRole: ExportActorRole;
  museumScope: number | null;
} {
  // Defensive — isAuthenticated already 401s upstream, but narrows the type.
  const user = req.user;
  if (!user) {
    throw forbidden('Authenticated user context missing');
  }
  return {
    actorId: user.id,
    actorRole: user.role as ExportActorRole,
    museumScope: user.museumId ?? null,
  };
}

/** BOM → header → data rows. Use case has awaited audit row (N6/AC10). */
async function streamCsv(
  res: Response,
  headers: readonly string[],
  rows: AsyncIterable<object>,
): Promise<void> {
  res.write(writeBomHeader());
  const headerRecord: Record<string, string> = {};
  for (const key of headers) {
    headerRecord[key] = key;
  }
  res.write(writeCsvRow(headerRecord));
  for await (const row of rows) {
    res.write(writeCsvRow(toRecord(headers, row)));
  }
  res.end();
}

adminExportRouter.get(
  '/export/:kind.csv',
  isAuthenticated,
  requireRole('admin', 'museum_manager'),
  async (req: Request, res: Response) => {
    const parsed = exportKindParamSchema.safeParse({ kind: req.params.kind });
    if (!parsed.success) {
      throw badRequest('Unsupported export kind');
    }
    // R10 forward-compat — from/to accepted, V1 ignores (R11 365d default in repo).
    const query = exportQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw badRequest('Invalid export query');
    }

    const { kind } = parsed.data;
    const actor = resolveActor(req);

    // D4/Risk2 defense-in-depth — redundant RBAC mirror so a future thin
    // pass-through refactor of the use case cannot leak data.
    if (kind === 'sessions') {
      if (
        (actor.actorRole === 'museum_manager' || actor.actorRole === 'admin') &&
        actor.museumScope === null
      ) {
        throw forbidden('No museum assigned');
      }
      const stream = await getExportChatSessionsUseCase().execute(actor);
      setCsvHeaders(res, 'sessions');
      await streamCsv(res, SESSIONS_HEADERS, stream);
      return;
    }
    // Q1 BLOCKER — reviews + tickets lack `museum_id`, super_admin only in V1.
    if (actor.actorRole !== 'super_admin') {
      throw forbidden(`${kind} export is restricted to super_admin`);
    }
    if (kind === 'reviews') {
      const stream = await getExportReviewsUseCase().execute(actor);
      setCsvHeaders(res, 'reviews');
      await streamCsv(res, REVIEWS_HEADERS, stream);
      return;
    }
    // kind === 'tickets'
    const stream = await getExportSupportTicketsUseCase().execute(actor);
    setCsvHeaders(res, 'tickets');
    await streamCsv(res, TICKETS_HEADERS, stream);
  },
);

export default adminExportRouter;
