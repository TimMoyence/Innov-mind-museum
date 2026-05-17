import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';

import { BREACH_EVENT_SET, type BreachEventName } from './breach-event-types';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';

/**
 * Awaitable audit logging service. SOC2 CC7.2 / GDPR Art. 30: row MUST exist
 * before privileged action HTTP response observable. Repository serialises
 * writes via `pg_advisory_xact_lock` for chain integrity (~5–100 ms/call).
 *
 * Internal errors caught and logged: audit-pipeline failure must never break
 * user request (the action already happened).
 */

/** Severity. Mirrors `BREACH_PLAYBOOK.md` § 3. */
export type BreachSeverity = 'P0' | 'P1' | 'P2';

/** 1:1 with `.github/ISSUE_TEMPLATE/security-incident.yml`. */
export type BreachDetectionSource =
  | 'sentry'
  | 'better_stack'
  | 'audit_anomaly'
  | 'rate_limit'
  | 'third_party'
  | 'user_report'
  | 'ci';

/** Personal-data classes per `BREACH_PLAYBOOK.md` § 1.3. */
export type BreachDataClass = 'account' | 'chat_text' | 'voice' | 'image' | 'geo' | 'ip' | 'none';

export type BreachContainmentStatus = 'not_started' | 'in_progress' | 'contained';

/**
 * GDPR Art 33-34 audit row input. ALWAYS route through
 * {@link AuditService.auditCriticalSecurityEvent}; do NOT call
 * {@link AuditService.log} with `breach_*` actions — that path skips Sentry
 * tagging + CNIL deadline + runbook contract.
 */
export interface BreachAuditEvent {
  /** Canonical name from `BREACH_EVENTS` (breach-event-types.ts). */
  eventName: BreachEventName;
  severity: BreachSeverity;
  /** T+0 — moment on-call became aware. */
  detectedAt: Date;
  detectionSource: BreachDetectionSource;
  affectedDataClasses: readonly BreachDataClass[];
  containmentStatus: BreachContainmentStatus;
  /** null when system-detected. */
  reporterUserId?: number | null;
  /** MUST be pre-redacted (no secrets, no raw PII). */
  description: string;
  requestId?: string | null;
  /** Anonymized after 13 months. */
  ip?: string | null;
}

export interface BreachAuditResult {
  auditId: string;
  /** GDPR Art 33 deadline = `detectedAt + 72h`, ISO-8601 UTC. */
  cnilDeadline: string;
}

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

const computeCnilDeadline = (detectedAt: Date): string =>
  new Date(detectedAt.getTime() + SEVENTY_TWO_HOURS_MS).toISOString();

export class AuditService {
  constructor(private readonly repository: IAuditLogRepository) {}

  /** Awaits insert; never throws. */
  async log(entry: AuditLogEntry): Promise<void> {
    // Guard: `breach_*` MUST go through `auditCriticalSecurityEvent` (Sentry
    // tag + CNIL deadline). Runtime check — TS can't statically ban prefix.
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
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT rethrow — audit failure must not break the user request.
    }
  }

  /** Awaits batch insert; never throws. */
  async logBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Refuse entire batch if any row would bypass breach-recording contract.
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
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT rethrow — audit failure must not break the user request.
    }
  }

  /**
   * GDPR Art 33-34. Single source of truth for breach events:
   *   - Writes hash-chained row to `audit_logs` (`action=event.eventName`,
   *     payload under `metadata.breach`, 13-month retention per audit §5.4).
   *   - Tags Sentry (`severity=breach`, `event=`, `auditId=`) for alerting.
   *   - Returns `auditId` (for GitHub incident issue) + CNIL 72h deadline.
   *
   * Hash chain unaffected by IP anonymization (IP excluded from hash payload).
   * Never throws on audit/Sentry failure — runbook must not block on infra
   * hiccups. `cnilDeadline` returned even if persistence fails.
   */
  async auditCriticalSecurityEvent(event: BreachAuditEvent): Promise<BreachAuditResult> {
    // Belt-and-braces against unsafe-cast callers.
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

    // Persist first — audit row is legally-binding artefact; Sentry tagging
    // is observability glue and must not block the write.
    try {
      await this.repository.insert(entry);
    } catch (error) {
      logger.error('audit_breach_insert_failed', {
        action: event.eventName,
        severity: event.severity,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue: emit Sentry anyway so on-call still gets paged.
    }

    // Tag Sentry for alerting. Safe no-op when Sentry not initialized.
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
      // Defensive: Sentry hiccup must not obscure the breach itself.
      logger.error('audit_breach_sentry_failed', {
        action: event.eventName,
        error: error instanceof Error ? error.message : String(error),
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
