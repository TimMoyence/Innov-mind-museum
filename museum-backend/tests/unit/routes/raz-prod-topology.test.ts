import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const BACKEND = join(__dirname, '..', '..', '..');

function composeServices(composePath: string): string[] {
  const lines = readFileSync(composePath, 'utf8').split('\n');
  const start = lines.findIndex((line) => line === 'services:');
  const services: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
    if (match) services.push(match[1]);
  }
  return services.sort((a, b) => a.localeCompare(b));
}

describe('RAZ-M2-COMPOSE', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('RAZ-M2-COMPOSE · la prod tient en backend, db, redis et museum-web', () => {
    expect(composeServices(join(BACKEND, 'deploy/docker-compose.prod.yml'))).toEqual([
      'backend',
      'db',
      'museum-web',
      'redis',
    ]);
  });

  it('RAZ-M2-COMPOSE · aucune configuration nginx ne sert Grafana ni sa porte super-admin', () => {
    const nginx = readFileSync(join(BACKEND, 'deploy/nginx/site.conf.prod'), 'utf8');

    expect(nginx).toContain('proxy_pass');
    expect(nginx).not.toMatch(/grafana|super-admin-check/i);
  });

  it('RAZ-M2-COMPOSE · /api/auth/super-admin-check n’existe plus et répond 404', async () => {
    const { app } = createRouteTestApp();

    const response = await request(app).get('/api/auth/super-admin-check');

    expect(response.status).toBe(404);
  });
});
