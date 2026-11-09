import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('F1 sentinel — chat-session.route.ts middleware order', () => {
  const ROUTE_PATH = path.resolve(
    __dirname,
    '../../../src/modules/chat/adapters/primary/http/routes/chat-session.route.ts',
  );

  let source: string;

  beforeAll(() => {
    source = readFileSync(ROUTE_PATH, 'utf-8');
  });

  it('F1.Q2 — validateBody(createSessionSchema) appears BEFORE monthlySessionQuota in POST /sessions', () => {
    const postBlockStart = source.indexOf("router.post(\n    '/sessions'");
    expect(postBlockStart).toBeGreaterThanOrEqual(0);

    const postBlock = source.slice(postBlockStart);

    const validateIdx = postBlock.indexOf('validateBody(createSessionSchema)');
    const quotaIdx = postBlock.indexOf('monthlySessionQuota');

    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(quotaIdx).toBeGreaterThanOrEqual(0);

    expect(validateIdx).toBeLessThan(quotaIdx);
  });

  it('F1.Q2 — both middleware identifiers are still grep-able after green code lands', () => {
    expect(source).toMatch(/validateBody\(createSessionSchema\)/);
    expect(source).toMatch(/monthlySessionQuota/);
  });
});
