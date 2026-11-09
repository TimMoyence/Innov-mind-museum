import fs from 'node:fs';
import path from 'node:path';

describe('F13 — LLM_INCLUDE_DIAGNOSTICS strict prod default (source contract)', () => {
  const envSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'src', 'config', 'env.ts'),
    'utf8',
  );

  it('diagnostics gated on nodeEnv === "development" (not "!== production")', () => {
    expect(envSource).toMatch(/includeDiagnostics:\s*\n\s*nodeEnv\s*===\s*'development'\s*\?/);
  });

  it('non-development branches resolve to false', () => {
    expect(envSource).toMatch(
      /includeDiagnostics:[\s\S]+?toBoolean\(process\.env\.LLM_INCLUDE_DIAGNOSTICS,\s*true\)\s*:\s*false/,
    );
  });

  it('does not retain the legacy "nodeEnv === \'production\' ? false : ..." form', () => {
    expect(envSource).not.toMatch(
      /includeDiagnostics:\s*\n\s*nodeEnv\s*===\s*'production'\s*\?\s*false/,
    );
  });
});
