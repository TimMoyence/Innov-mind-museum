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
import { forbidden, invalidInput } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { requireRole } from '@shared/middleware/require-role.middleware';

import type { ExportActorRole } from '@modules/admin/domain/export/csv-export.types';

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
      throw invalidInput('Unsupported export kind');
    }
    const query = exportQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw invalidInput('Invalid export query');
    }

    const { kind } = parsed.data;
    const actor = resolveActor(req);

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
    if (actor.actorRole !== 'super_admin') {
      throw forbidden(`${kind} export is restricted to super_admin`);
    }
    if (kind === 'reviews') {
      const stream = await getExportReviewsUseCase().execute(actor);
      setCsvHeaders(res, 'reviews');
      await streamCsv(res, REVIEWS_HEADERS, stream);
      return;
    }
    const stream = await getExportSupportTicketsUseCase().execute(actor);
    setCsvHeaders(res, 'tickets');
    await streamCsv(res, TICKETS_HEADERS, stream);
  },
);

export default adminExportRouter;
