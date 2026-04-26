import { randomUUID } from 'node:crypto';

import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';

import { BREACH_EVENT_SET, type BreachEventName } from './breach-event-types';

import type { IAuditLogRepository } from './audit.repository.interface';
import type { AuditLogEntry } from './audit.types';

/**
 * Awaitable audit logging service.
 *
 * Returns a Promise so callers can `await` durability before responding to the
 * user (essential for SOC2 CC7.2 / GDPR Art. 30: an audit row MUST exist before
 * the privileged action's HTTP response is observable). The repository
 * serialises writes via `pg_advisory_xact_lock` for chain integrity, so each
 * call costs ~5–100 ms — acceptable for privileged routes.
 *
 * Internal errors are caught and logged: an audit-pipeline failure must never
 * break the user request (the action already happened).
 */

/** Severity levels for breach events. Mirrors `BREACH_PLAYBOOK.md` § 3. */
export type BreachSeverity = 'P0' | 'P1' | 'P2';

/** Detection sources, mirrored 1:1 with `.github/ISSUE_TEMPLATE/security-incident.yml`. */
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

/** Containment status per security-incident issue template. */
export type BreachContainmentStatus = 'not_started' | 'in_progress' | 'contained';

/**
 * Structured input for a breach (GDPR Art 33-34) audit row.
 *
 * Always routed through {@link AuditService.auditCriticalSecurityEvent}; do
 * NOT call {@link AuditService.log} directly with `breach_*` actions — the
 * `auditCriticalSecurityEvent` path is the single source of truth for breach
 * recording (Sentry tagging, CNIL deadline computation, runbook contract).
 */
export interface BreachAuditEvent {
  /** Canonical event name from `BREACH_EVENTS` (see breach-event-types.ts). */
  eventName: BreachEventName;
  severity: BreachSeverity;
  /** T+0 — the moment the on-call became aware. */
  detectedAt: Date;
  detectionSource: BreachDetectionSource;
  affectedDataClasses: readonly BreachDataClass[];
  containmentStatus: BreachContainmentStatus;
  /** Reporting user ID; null when the breach was system-detected. */
  reporterUserId?: number | null;
  /** Free text — must already be redacted (no secrets, no raw PII). */
  description: string;
  /** Optional request correlation ID to thread the row to incident logs. */
  requestId?: string | null;
  /** Optional source IP (e.g. user-report path); anonymized after 13 months. */
  ip?: string | null;
}

/** Result of recording a breach event. */
export interface BreachAuditResult {
  /** UUID of the audit_logs row that anchors this incident. */
  auditId: string;
  /** GDPR Art 33 deadline = `detectedAt + 72h`, ISO-8601 UTC. */
  cnilDeadline: string;
}

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

/** Computes the GDPR Art 33 notification deadline. */
const computeCnilDeadline = (detectedAt: Date): string =>
  new Date(detectedAt.getTime() + SEVENTY_TWO_HOURS_MS).toISOString();

/**
 *
 */
export class AuditService {
  constructor(private readonly repository: IAuditLogRepository) {}

  /** Log a single audit event. Awaits the insert; never throws. */
  async log(entry: AuditLogEntry): Promise<void> {
    // Guard: free-form `breach_*` writes must go through
    // `auditCriticalSecurityEvent` so Sentry tagging + CNIL deadline are
    // always emitted. Lint-equivalent runtime check — we cannot statically
    // ban a string prefix in TS without help.
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

  /** Log multiple audit events in a single batch. Awaits the insert; never throws. */
  async logBatch(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Same guard as `log()`: refuse the entire batch if any row would
    // bypass the breach-recording contract.
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
   * Records a confirmed or strongly suspected personal-data breach (GDPR
   * Art 33-34). Single source of truth for breach events:
   *
   *   - Writes a hash-chained row to `audit_logs` with `action = event.eventName`
   *     and the full typed payload nested under `metadata.breach` (no schema
   *     change required — payload survives 13 months per § 5.4 of the audit).
   *   - Tags Sentry (`severity=breach`, `event=…`, `auditId=…`) so existing
   *     alerting catches the event with full forensic context.
   *   - Returns the `auditId` so the caller can paste it into the GitHub
   *     incident issue, plus the computed CNIL 72h deadline (Art 33).
   *
   * The hash chain is unaffected by IP anonymization (IP excluded from the
   * hash payload), so this row remains verifiable for the entire 13-month
   * retention window.
   *
   * Never throws on audit / Sentry pipeline failures — the runbook must
   * not be blocked by transient infra hiccups. The `cnilDeadline` is still
   * returned even if persistence fails so the caller can stamp the issue.
   */
  async auditCriticalSecurityEvent(event: BreachAuditEvent): Promise<BreachAuditResult> {
    // Belt-and-braces: only canonical event names admitted, even though the
    // type already constrains callers. Defends against unsafe-cast callers.
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

    // Persist first — the audit row is the legally-binding artefact. Sentry
    // tagging is observability glue and must not block the write.
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

    // Tag Sentry so existing alerting catches the breach. No-op when
    // Sentry is not initialized — `Sentry.captureMessage` is safe to call.
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
      // Sentry SDK should never throw, but defensive: do not let a Sentry
      // hiccup obscure the breach itself.
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
