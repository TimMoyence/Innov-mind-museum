import { describe, it, expect } from '@jest/globals';
import { vps } from './helpers/vps-deploy.mjs';

describe('MIGRATION-FIRST', () => {
  it('MIGRATION-FIRST · un premier déploiement sur une base sans table migrations note toutes les siennes', () => {
    const server = vps({ migrations: 'absent', pending: 81 });

    expect(server.capture().status).toBe(0);
    const deploy = server.deploy();

    expect(deploy.status).toBe(0);
    expect(deploy.stdout).toContain('[deploy] migrations applied this deploy: 81');
    expect(server.appliedCount()).toBe('81');
  });
});
