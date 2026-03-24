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
    expect(payload.timestamp).toBeDefined();
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
});
