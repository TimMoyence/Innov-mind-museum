import { buildHealthPayload } from '@shared/routers/api.router';

describe('buildHealthPayload', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

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

  it('includes commitSha when COMMIT_SHA is set', () => {
    process.env.COMMIT_SHA = 'abc123def';
    process.env.GITHUB_SHA = '';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.commitSha).toBe('abc123def');
  });

  it('falls back to GITHUB_SHA when COMMIT_SHA is absent', () => {
    delete process.env.COMMIT_SHA;
    process.env.GITHUB_SHA = 'ghsha456';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.commitSha).toBe('ghsha456');
  });

  it('omits commitSha when neither env var is set', () => {
    delete process.env.COMMIT_SHA;
    delete process.env.GITHUB_SHA;

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.commitSha).toBeUndefined();
  });

  it('omits commitSha when env vars are empty strings', () => {
    process.env.COMMIT_SHA = '';
    process.env.GITHUB_SHA = '   ';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.commitSha).toBeUndefined();
  });

  it('uses APP_VERSION when set', () => {
    process.env.APP_VERSION = '2.0.0';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.version).toBe('2.0.0');
  });

  it('falls back to npm_package_version when APP_VERSION is absent', () => {
    delete process.env.APP_VERSION;
    process.env.npm_package_version = '1.5.0';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.version).toBe('1.5.0');
  });

  it('returns "unknown" when no version env var is set', () => {
    delete process.env.APP_VERSION;
    delete process.env.npm_package_version;

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.version).toBe('unknown');
  });

  it('trims whitespace from APP_VERSION', () => {
    process.env.APP_VERSION = '  3.0.0  ';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.version).toBe('3.0.0');
  });

  it('skips APP_VERSION if it is empty after trim', () => {
    process.env.APP_VERSION = '   ';
    process.env.npm_package_version = '1.2.3';

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    // Empty APP_VERSION should fall through to npm_package_version
    expect(payload.version).toBe('1.2.3');
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
