import { Router, type Request, type Response } from 'express';

import {
  exportKindParamSchema,
  exportQuerySchema,
} from '@modules/admin/adapters/primary/http/schemas/admin-export.schemas';
import {
  exportChatSessionsUseCase,
  exportReviewsUseCase,
  exportSupportTicketsUseCase,
} from '@modules/admin/useCase';
import { writeBomHeader, writeCsvRow } from '@shared/csv/csv-writer';
import { badRequest, forbidden } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { requireRole } from '@shared/middleware/require-role.middleware';

import type { ExportActorRole } from '@modules/admin/domain/export/csv-export.types';

/**
 * Admin CSV export router — three endpoints (sessions / reviews / tickets).
 *
 * Pipeline per request :
 *   1. `isAuthenticated` → 401 on missing / invalid JWT.
 *   2. `requireRole('admin', 'museum_manager')` → 403 on visitor / moderator
 *      (super_admin implicitly satisfies, see require-role.middleware:28).
 *   3. Validate `:kind` enum (sessions / reviews / tickets) → 400 otherwise.
 *   4. Delegate to the matching use case which awaits the audit row BEFORE
 *      returning the data stream (N6 / AC10 — audit log durable before
 *      first byte).
 *   5. Set CSV headers + write UTF-8 BOM + header row + data rows.
 *
 * Use case throws AppError(403) for Q1 BLOCKER cases (museum_manager /
 * admin on reviews/tickets) and R9 NO_MUSEUM_ASSIGNED — the global error
 * middleware translates to the proper JSON shape.
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

/** Builds the standardised CSV download response headers (R1 / R13 / N10). */
function setCsvHeaders(res: Response, kind: 'sessions' | 'reviews' | 'tickets'): void {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-${date}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
}

/** Maps a typed row to the ordered string record consumed by `writeCsvRow`. */
function toRecord(headers: readonly string[], row: object): Record<string, string> {
  const out: Record<string, string> = {};
  const indexed = row as Record<string, unknown>;
  for (const key of headers) {
    out[key] = coerceCell(indexed[key]);
  }
  return out;
}

/**
 * Coerces an unknown cell value to a CSV-safe string. Numbers + booleans
 * stringify naturally ; objects / arrays / null / undefined collapse to
 * empty so an accidental DTO leak never lands a raw `[object Object]` in
 * a downloaded CSV (no-base-to-string lint).
 */
function coerceCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

/** Resolves the actor role + museum scope from the authenticated request. */
function resolveActor(req: Request): {
  actorId: number;
  actorRole: ExportActorRole;
  museumScope: number | null;
} {
  // isAuthenticated has populated req.user ; the global error middleware
  // converts a missing one into 401 upstream so this never fires in
  // practice, but defensive null check keeps the type narrow.
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

/**
 * Streams an `AsyncIterable` of rows as CSV chunks onto the response.
 *
 * Performs : BOM → header row → data rows. The use case has already awaited
 * its audit row, so by the time we reach this helper the audit is durable
 * (N6 / AC10).
 */
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
    // Query params (from / to) accepted for forward-compat (R10) but not
    // forwarded into V1 use cases (R11 default 365d window applies inside
    // the repository). Validate anyway so a bad format still 400s.
    const query = exportQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw badRequest('Invalid export query');
    }

    const { kind } = parsed.data;
    const actor = resolveActor(req);

    // Defense-in-depth (D4 / Risk2) — the route enforces the SAME RBAC
    // table as the use case so a future refactor that swaps the use case
    // for a thin pass-through cannot leak data. The use case still owns
    // the canonical denial path ; this is a redundant guard.
    if (kind === 'sessions') {
      if (
        (actor.actorRole === 'museum_manager' || actor.actorRole === 'admin') &&
        actor.museumScope === null
      ) {
        throw forbidden('No museum assigned');
      }
      const stream = await exportChatSessionsUseCase.execute(actor);
      setCsvHeaders(res, 'sessions');
      await streamCsv(res, SESSIONS_HEADERS, stream);
      return;
    }
    // Q1 BLOCKER — reviews + tickets entities lack `museum_id` ; only
    // super_admin may export those two kinds in V1.
    if (actor.actorRole !== 'super_admin') {
      throw forbidden(`${kind} export is restricted to super_admin`);
    }
    if (kind === 'reviews') {
      const stream = await exportReviewsUseCase.execute(actor);
      setCsvHeaders(res, 'reviews');
      await streamCsv(res, REVIEWS_HEADERS, stream);
      return;
    }
    // kind === 'tickets'
    const stream = await exportSupportTicketsUseCase.execute(actor);
    setCsvHeaders(res, 'tickets');
    await streamCsv(res, TICKETS_HEADERS, stream);
  },
);

export default adminExportRouter;
