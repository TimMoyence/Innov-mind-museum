import { buildHealthPayload } from '@shared/routers/api.router';

describe('health response contract', () => {
  const previousAppVersion = process.env.APP_VERSION;
  const previousCommitSha = process.env.COMMIT_SHA;

  afterEach(() => {
    if (previousAppVersion === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = previousAppVersion;
    }

    if (previousCommitSha === undefined) {
      delete process.env.COMMIT_SHA;
    } else {
      process.env.COMMIT_SHA = previousCommitSha;
    }
  });

  it('includes environment/version fields without breaking existing checks object', () => {
    process.env.APP_VERSION = '1.2.3-test';
    delete process.env.COMMIT_SHA;

    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('ok');
    expect(payload.checks.database).toBe('up');
    expect(payload.checks.llmConfigured).toBe(true);
    expect(payload.environment).toBe('test');
    expect(payload.version).toBe('1.2.3-test');
    expect(typeof payload.timestamp).toBe('string');
    expect(payload).not.toHaveProperty('commitSha');
  });

  it('keeps commitSha optional and present when available', () => {
    process.env.APP_VERSION = '2.0.0';
    process.env.COMMIT_SHA = 'abc1234';

    const payload = buildHealthPayload({
      checks: { database: 'down' },
      llmConfigured: false,
    });

    expect(payload.status).toBe('degraded');
    expect(payload.commitSha).toBe('abc1234');
  });
});
