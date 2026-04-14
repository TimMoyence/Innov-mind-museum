import { buildHealthPayload } from '@shared/routers/api.router';
import { env } from '@src/config/env';

describe('buildHealthPayload', () => {
  it('returns status "ok" when database is up', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('ok');
    expect(payload.checks.database).toBe('up');
    expect(payload.checks.llmConfigured).toBe(true);
    expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
  });

  it('returns status "degraded" when database is down', () => {
    const payload = buildHealthPayload({
      checks: { database: 'down' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('degraded');
    expect(payload.checks.database).toBe('down');
  });

  it('reflects llmConfigured=false', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: false,
    });

    expect(payload.checks.llmConfigured).toBe(false);
  });

  it('uses centralized env.appVersion for version', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.version).toBe(env.appVersion);
  });

  it('uses centralized env.commitSha for commitSha', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.commitSha).toBe(env.commitSha);
  });

  // ── Redis status ────────────────────────────────────────────────────

  it('includes redis status when provided', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up', redis: 'up' },
      llmConfigured: true,
    });

    expect(payload.checks.redis).toBe('up');
    expect(payload.status).toBe('ok');
  });

  it('returns status "degraded" when redis is down', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up', redis: 'down' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('degraded');
    expect(payload.checks.redis).toBe('down');
  });

  it('omits redis from checks when not provided', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.checks.redis).toBeUndefined();
  });

  it('shows "skipped" for redis when cache is disabled', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up', redis: 'skipped' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('ok');
    expect(payload.checks.redis).toBe('skipped');
  });

  // ── Circuit breaker state ──────────────────────────────────────────

  it('includes llmCircuitBreaker state when provided', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up', llmCircuitBreaker: 'CLOSED' },
      llmConfigured: true,
    });

    expect(payload.checks.llmCircuitBreaker).toBe('CLOSED');
  });

  it('omits llmCircuitBreaker when not provided', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.checks.llmCircuitBreaker).toBeUndefined();
  });

  // ── DB down = 503 scenario ─────────────────────────────────────────

  it('returns degraded status when database is down with redis up', () => {
    const payload = buildHealthPayload({
      checks: { database: 'down', redis: 'up' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('degraded');
    expect(payload.checks.database).toBe('down');
  });

  it('returns degraded status when both database and redis are down', () => {
    const payload = buildHealthPayload({
      checks: { database: 'down', redis: 'down' },
      llmConfigured: false,
    });

    expect(payload.status).toBe('degraded');
    expect(payload.checks.database).toBe('down');
    expect(payload.checks.redis).toBe('down');
    expect(payload.checks.llmConfigured).toBe(false);
  });

  // ── Timestamp format ───────────────────────────────────────────────

  it('returns a valid ISO-8601 timestamp', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    const parsed = new Date(payload.timestamp);
    expect(parsed.toISOString()).toBe(payload.timestamp);
  });
});
