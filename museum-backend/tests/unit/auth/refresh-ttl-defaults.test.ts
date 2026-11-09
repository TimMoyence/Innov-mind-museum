import fs from 'node:fs';
import path from 'node:path';

describe('F8 — refresh TTL hardening defaults (source contract)', () => {
  const envSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'src', 'config', 'env.ts'),
    'utf8',
  );

  it('refresh absolute TTL default literal is "14d"', () => {
    expect(envSource).toMatch(/refreshTokenTtl:\s*process\.env\.JWT_REFRESH_TTL\s*\|\|\s*'14d'/);
  });

  it('refresh idle window default literal is 24 * 60 * 60 (24h)', () => {
    expect(envSource).toMatch(/JWT_REFRESH_IDLE_WINDOW_SECONDS,\s*24\s*\*\s*60\s*\*\s*60/);
  });
});
