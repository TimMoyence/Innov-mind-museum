import { describe, it, expect } from '@jest/globals';
import { vps } from './helpers/vps-deploy.mjs';

describe('MIGRATION-COUNT', () => {
  it('MIGRATION-COUNT · le déploiement note la migration qu’il joue', () => {
    const server = vps({ migrations: 81, pending: 1 });

    expect(server.capture().status).toBe(0);
    const deploy = server.deploy();

    expect(deploy.status).toBe(0);
    expect(deploy.stdout).toContain('[deploy] migrations applied this deploy: 1');
    expect(server.appliedCount()).toBe('1');
    expect(server.migrations()).toBe(82);
  });

  it('MIGRATION-COUNT · le rollback qui suit défait exactement cette migration', () => {
    const server = vps({ migrations: 81, pending: 1 });
    server.capture();
    server.deploy();

    const rollback = server.rollback();

    expect(rollback.status).toBe(0);
    expect(server.reverts()).toBe(1);
    expect(server.migrations()).toBe(81);
  });

  it('MIGRATION-COUNT · une base illisible arrête le déploiement avant toute migration', () => {
    const server = vps({ migrations: 81, pending: 1 });

    const capture = server.capture({ STUB_DB_DOWN: '1' });

    expect(capture.status).not.toBe(0);
    expect(capture.stderr).toContain('[count-migrations] impossible de lire la table migrations');
  });
});
