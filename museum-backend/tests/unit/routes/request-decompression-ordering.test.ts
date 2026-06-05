/**
 * W1-GZIP-03 (RED) — structural mount-ordering + CORS assertion on app.ts.
 *
 * spec.md §EARS R6:
 *   THE decompression middleware SHALL run in prod (no NODE_ENV guard); a
 *   sentinel asserts Content-Encoding in CORS + mount-before-express.json +
 *   no prod-refusal.
 *
 * design.md §Architecture / §Verified anchors:
 *   - Decompression MOUNTS after compression() + setTimeout, STRICTLY before
 *     express.json (app.ts:180).
 *   - Add 'Content-Encoding' to CORS allowedHeaders.
 *
 * Mirrors tests/unit/routes/middleware-ordering.test.ts: read app.ts as a
 * string, assert the relative index of the `requestDecompressionMiddleware`
 * mount vs `compression(` and `express.json(`, and that CORS allowedHeaders
 * lists 'Content-Encoding'.
 *
 * RED state: app.ts does not yet mention `requestDecompressionMiddleware`
 * nor 'Content-Encoding' in CORS → every index resolves to -1 → assertions fail.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */

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

    // compression() < requestDecompressionMiddleware < express.json(
    expect(compressionIdx).toBeLessThan(decompressionIdx);
    expect(decompressionIdx).toBeLessThan(jsonIdx);
  });

  it("R6 — CORS allowedHeaders includes 'Content-Encoding'", () => {
    // Locate the allowedHeaders array literal and assert the header is listed.
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

    // Prod-safe capability (NOT a fault injector): the middleware must not
    // gate its core behavior behind a production refusal. It may READ NODE_ENV
    // for logging, but must not branch to disable decompression in prod.
    expect(mwSource).not.toMatch(/NODE_ENV\s*===\s*['"]production['"]/);
    expect(mwSource).not.toMatch(/isProd/);
  });
});
