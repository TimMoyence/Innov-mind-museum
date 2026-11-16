import { describe, it, expect } from '@jest/globals';
import { vps } from './helpers/vps-deploy.mjs';

describe('MIGRATION-STALE', () => {
  it('MIGRATION-STALE · un déploiement qui échoue avant ses migrations ne défait pas celles du précédent', () => {
    const server = vps({ migrations: 81, pending: 1 });
    server.capture();
    expect(server.deploy().status).toBe(0);

    expect(server.capture().status).toBe(0);
    expect(server.deploy({ STUB_PULL_FAIL: '1' }).status).not.toBe(0);
    const rollback = server.rollback({ STUB_DB_DOWN: '1' });

    expect(rollback.status).toBe(0);
    expect(server.reverts()).toBe(0);
    expect(server.migrations()).toBe(82);
  });
});
