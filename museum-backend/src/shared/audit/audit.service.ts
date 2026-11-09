import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/node';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import { BREACH_EVENT_SET, type BreachEventName } from './breach-event-types';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';

export interface LogActorActionInput {
  action: string;
  actorId: number;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  requestId?: string | null;
}

export type BreachSeverity = 'P0' | 'P1' | 'P2';

export type BreachDetectionSource =
  | 'sentry'
  | 'better_stack'
  | 'audit_anomaly'
  | 'rate_limit'
  | 'third_party'
  | 'user_report'
  | 'ci';

export type BreachDataClass = 'account' | 'chat_text' | 'voice' | 'image' | 'geo' | 'ip' | 'none';

export type BreachContainmentStatus = 'not_started' | 'in_progress' | 'contained';

export interface BreachAuditEvent {
  eventName: BreachEventName;
  severity: BreachSeverity;
  detectedAt: Date;
  detectionSource: BreachDetectionSource;
  affectedDataClasses: readonly BreachDataClass[];
  containmentStatus: BreachContainmentStatus;
  reporterUserId?: number | null;
  description: string;
  requestId?: string | null;
  ip?: string | null;
}

export interface BreachAuditResult {
  auditId: string;
  cnilDeadline: string;
}

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

const computeCnilDeadline = (detectedAt: Date): string =>
  new Date(detectedAt.getTime() + SEVENTY_TWO_HOURS_MS).toISOString();

export class AuditService {
  constructor(private readonly repository: IAuditLogRepository) {}

  async log(entry: AuditLogEntry): Promise<void> {
    if (BREACH_EVENT_SET.has(entry.action)) {
      logger.error('audit_log_breach_misuse', {
        action: entry.action,
        message:
          'Breach events must go through AuditService.auditCriticalSecurityEvent — refusing to write a row that would skip Sentry tagging and CNIL deadline tracking.',
      });
      return;
    }

    try {
      await this.repository.insert(entry);
    } catch (error) {
      logger.error('audit_log_failed', {
        action: entry.action,
        error: errorMessage(error),
      });
      captureExceptionWithContext(error, { action: entry.action, kind: 'audit_log_failed' });
    }
  }

  async logBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const offending = entries.find((e) => BREACH_EVENT_SET.has(e.action));
    if (offending) {
      logger.error('audit_log_breach_misuse_batch', {
        action: offending.action,
        message:
          'Breach events must go through AuditService.auditCriticalSecurityEvent — refusing the batch.',
      });
      return;
    }

    try {
      await this.repository.insertBatch(entries);
    } catch (error) {
      logger.error('audit_log_batch_failed', {
        count: entries.length,
        error: errorMessage(error),
      });
    }
  }

  async logActorAction(input: LogActorActionInput): Promise<void> {
    await this.log({
      action: input.action,
      actorType: 'user',
      actorId: input.actorId,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });
  }

  async auditCriticalSecurityEvent(event: BreachAuditEvent): Promise<BreachAuditResult> {
    if (!BREACH_EVENT_SET.has(event.eventName)) {
      throw new TypeError(
        `auditCriticalSecurityEvent: unknown breach event "${event.eventName}". ` +
          `Use a constant from BREACH_EVENTS (see breach-event-types.ts).`,
      );
    }

    const auditId = randomUUID();
    const cnilDeadline = computeCnilDeadline(event.detectedAt);

    const entry: AuditLogEntry = {
      action: event.eventName,
      actorType: event.reporterUserId == null ? 'system' : 'user',
      actorId: event.reporterUserId ?? null,
      targetType: 'breach',
      targetId: auditId,
      metadata: {
        breach: {
          auditId,
          severity: event.severity,
          detectedAt: event.detectedAt.toISOString(),
          detectionSource: event.detectionSource,
          affectedDataClasses: [...event.affectedDataClasses],
          containmentStatus: event.containmentStatus,
          description: event.description,
          cnilDeadline,
          schemaVersion: 1,
        },
      },
      ip: event.ip ?? null,
      requestId: event.requestId ?? null,
    };

    try {
      await this.repository.insert(entry);
    } catch (error) {
      logger.error('audit_breach_insert_failed', {
        action: event.eventName,
        severity: event.severity,
        error: errorMessage(error),
      });
    }

    try {
      Sentry.withScope((scope) => {
        scope.setTag('severity', 'breach');
        scope.setTag('event', event.eventName);
        scope.setTag('auditId', auditId);
        scope.setTag('breachSeverity', event.severity);
        scope.setTag('detectionSource', event.detectionSource);
        scope.setLevel(event.severity === 'P0' ? 'fatal' : 'error');
        scope.setContext('breach', {
          auditId,
          eventName: event.eventName,
          severity: event.severity,
          detectedAt: event.detectedAt.toISOString(),
          detectionSource: event.detectionSource,
          affectedDataClasses: [...event.affectedDataClasses],
          containmentStatus: event.containmentStatus,
          cnilDeadline,
        });
        Sentry.captureMessage(`[BREACH ${event.severity}] ${event.eventName} — auditId=${auditId}`);
      });
    } catch (error) {
      logger.error('audit_breach_sentry_failed', {
        action: event.eventName,
        error: errorMessage(error),
      });
    }

    logger.warn('audit_breach_recorded', {
      auditId,
      eventName: event.eventName,
      severity: event.severity,
      detectionSource: event.detectionSource,
      cnilDeadline,
    });

    return { auditId, cnilDeadline };
  }
}
