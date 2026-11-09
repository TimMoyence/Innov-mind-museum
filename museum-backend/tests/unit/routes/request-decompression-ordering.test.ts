import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP_TS = path.resolve(__dirname, '../../../src/app.ts');

describe('request decompression — structural mount ordering (W1-GZIP-03)', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(APP_TS, 'utf-8');
  });

  it('R6 — requestDecompressionMiddleware is mounted in app.ts', () => {
    expect(source).toContain('requestDecompressionMiddleware');
  });

  it('R6 — decompression mount appears AFTER compression() and BEFORE express.json(', () => {
    const compressionIdx = source.indexOf('compression(');
    const decompressionIdx = source.indexOf('requestDecompressionMiddleware');
    const jsonIdx = source.indexOf('express.json(');

    expect(compressionIdx).toBeGreaterThanOrEqual(0);
    expect(decompressionIdx).toBeGreaterThanOrEqual(0);
    expect(jsonIdx).toBeGreaterThanOrEqual(0);

    expect(compressionIdx).toBeLessThan(decompressionIdx);
    expect(decompressionIdx).toBeLessThan(jsonIdx);
  });

  it("R6 — CORS allowedHeaders includes 'Content-Encoding'", () => {
    const allowedHeadersIdx = source.indexOf('allowedHeaders');
    expect(allowedHeadersIdx).toBeGreaterThanOrEqual(0);

    const block = source.slice(allowedHeadersIdx, allowedHeadersIdx + 600);
    expect(block).toMatch(/['"]Content-Encoding['"]/);
  });

  it('R6 — decompression middleware is prod-SAFE (no NODE_ENV / isProd refusal guard in its module)', () => {
    const mwPath = path.resolve(
      __dirname,
      '../../../src/shared/middleware/request-decompression.middleware.ts',
    );
    const mwSource = readFileSync(mwPath, 'utf-8');

    expect(mwSource).not.toMatch(/NODE_ENV\s*===\s*['"]production['"]/);
    expect(mwSource).not.toMatch(/isProd/);
  });
});
