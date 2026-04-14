import { buildHealthPayload } from '@shared/routers/api.router';
import { env } from '@src/config/env';

describe('health response contract', () => {
  it('includes environment/version fields without breaking existing checks object', () => {
    const payload = buildHealthPayload({
      checks: { database: 'up' },
      llmConfigured: true,
    });

    expect(payload.status).toBe('ok');
    expect(payload.checks.database).toBe('up');
    expect(payload.checks.llmConfigured).toBe(true);
    expect(payload.environment).toBe('test');
    expect(payload.version).toBe(env.appVersion);
    expect(typeof payload.timestamp).toBe('string');
  });

  it('returns commitSha from centralized env config', () => {
    const payload = buildHealthPayload({
      checks: { database: 'down' },
      llmConfigured: false,
    });

    expect(payload.status).toBe('degraded');
    expect(payload.commitSha).toBe(env.commitSha);
  });
});
