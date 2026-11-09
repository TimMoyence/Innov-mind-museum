import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateGithubCondition } from '../../helpers/workflow/github-condition';

const WORKFLOW = readFileSync(
  resolve(__dirname, '../../../../.github/workflows/ci-cd-mobile.yml'),
  'utf8',
);

const job =
  WORKFLOW.split(/^(?= {2}[a-z][a-z0-9-]*:$)/m).find((block) =>
    block.startsWith('  maestro-ios-nightly:'),
  ) ?? '';

const steps = job.split(/^(?= {6}- )/m).slice(1);

const step = (name: string): string => steps.find((s) => s.includes(`name: ${name}`)) ?? '';

const runsOn = (event: string): boolean =>
  evaluateGithubCondition(/^ {4}if: (.*)$/m.exec(job)?.[1] ?? 'false', { event });

describe('MAESTRO-IOS', () => {
  it('MAESTRO-IOS · la suite iOS tourne la nuit et au lancement manuel', () => {
    expect(runsOn('schedule')).toBe(true);
    expect(runsOn('workflow_dispatch')).toBe(true);
    expect(runsOn('pull_request')).toBe(false);
  });

  it('MAESTRO-IOS · le runner macOS ne dépend jamais de Docker', () => {
    expect(job).not.toMatch(/\bdocker\b/);
    expect(step('Boot backend')).toMatch(/SKIP_DOCKER_COMPOSE: '1'/);
  });

  it('MAESTRO-IOS · Postgres 16 avec pgvector et Redis démarrent sur le port lu par le backend', () => {
    const services = step('Start PostgreSQL');

    expect(services).toMatch(/postgresql@16/);
    expect(services).toMatch(/pgvector/);
    expect(services).toMatch(/pg_ctl .*-p 5432/);
    expect(services).toMatch(/redis-server --port 6379 --daemonize yes/);
    expect(step('Boot backend')).toMatch(/DB_PORT: '5432'/);
    expect(step('Seed e2e Maestro login accounts')).toMatch(/DB_PORT=5432 /);
  });

  it('MAESTRO-IOS · l’app porte l’identifiant que visent les flows', () => {
    const flow = readFileSync(
      resolve(__dirname, '../../../../museum-frontend/.maestro/auth-flow.yaml'),
      'utf8',
    );
    const appId = /^appId: (\S+)$/m.exec(flow)?.[1];

    expect(appId).toBeDefined();
    expect(step('Build iOS')).toContain(`PRODUCT_BUNDLE_IDENTIFIER=${appId}`);
  });

  it('MAESTRO-IOS · l’app embarque son bundle et vise le backend local', () => {
    expect(job).toMatch(/^ {6}EXPO_PUBLIC_API_BASE_URL: http:\/\/localhost:3000$/m);
    expect(job).toMatch(/^ {6}APP_VARIANT: development$/m);
    expect(step('Build iOS')).toMatch(/-configuration Release/);
    expect(step('Install app on simulator')).toMatch(/Release-iphonesimulator/);
  });

  it('MAESTRO-IOS · le simulateur se crée sur le runtime installé et un échec se voit', () => {
    expect(step('Boot iOS Simulator')).not.toMatch(/iOS\d/);
    expect(job).not.toMatch(/\|\| true/);
  });
});
