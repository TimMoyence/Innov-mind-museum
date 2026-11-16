import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveApiBaseUrl, resolveVariant } from '../../../../museum-frontend/api-url.config';
import { evaluateGithubCondition } from '../../helpers/workflow/github-condition';

const WORKFLOW = readFileSync(
  resolve(__dirname, '../../../../.github/workflows/ci-cd-mobile.yml'),
  'utf8',
);

const jobBlock = (name: string): string =>
  WORKFLOW.split(/^(?= {2}[a-z][a-z0-9-]*:$)/m).find((block) => block.startsWith(`  ${name}:`)) ??
  '';

const job = jobBlock('maestro-ios-nightly');

const stepsOf = (block: string): string[] => block.split(/^(?= {6}- )/m).slice(1);

const steps = stepsOf(job);

const step = (name: string): string => steps.find((s) => s.includes(`name: ${name}`)) ?? '';

const jobEnv = (name: string): string | undefined =>
  new RegExp(`^ {6}${name}: (\\S+)$`, 'm').exec(job)?.[1];

const runsOn = (event: string, block = job): boolean =>
  evaluateGithubCondition(/^ {4}if: (.*)$/m.exec(block)?.[1] ?? 'false', { event });

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

  it('MAESTRO-IOS · l’app Release embarque son bundle et vise le backend local, jamais la prod', () => {
    const env = {
      CONFIGURATION: 'Release',
      APP_VARIANT: jobEnv('APP_VARIANT'),
      EXPO_PUBLIC_API_BASE_URL: jobEnv('EXPO_PUBLIC_API_BASE_URL'),
    };

    expect(job.match(/\bAPP_VARIANT\b/g)).toHaveLength(1);
    expect(job.match(/\bEXPO_PUBLIC_API_BASE_URL\b/g)).toHaveLength(1);
    expect(env.APP_VARIANT).toBe('e2e');
    expect(env.EXPO_PUBLIC_API_BASE_URL).toBe('http://localhost:3000');
    expect(resolveApiBaseUrl(resolveVariant(env), env)).toBe('http://localhost:3000');
    expect(step('Build iOS')).toMatch(/-configuration Release/);
    expect(step('Install app on simulator')).toMatch(/Release-iphonesimulator/);
  });

  it('SIGNATURE-ADHOC · l’app de simulateur est signée ad hoc pour que le trousseau garde les jetons', () => {
    expect(job.match(/\bxcodebuild\b/g)).toHaveLength(1);
    expect(step('Build iOS').match(/\bxcodebuild\b/g)).toHaveLength(1);
    expect(
      job
        .split(/\s+/)
        .filter((word) => /code_?sign|development_team|provisioning_profile/i.test(word)),
    ).toEqual([
      'CODE_SIGN_IDENTITY=-',
      'CODE_SIGN_STYLE=Manual',
      'DEVELOPMENT_TEAM=',
      'PROVISIONING_PROFILE_SPECIFIER=',
    ]);
    expect(job).not.toMatch(/xcconfig/i);
  });

  it('MAESTRO-IOS · le simulateur se crée sur le runtime installé et un échec se voit', () => {
    expect(step('Boot iOS Simulator')).not.toMatch(/iOS\d/);
    expect(job).not.toMatch(/\|\| true/);
  });

  it('COMPARE-IOS · le nightly iOS reçoit le modèle SigLIP extrait sous Linux et provisionne la comparaison d’image', () => {
    const provider = jobBlock('siglip-model');
    const upload = stepsOf(provider).find((s) => s.includes('actions/upload-artifact@')) ?? '';
    const download = steps.findIndex((s) => s.includes('actions/download-artifact@'));
    const artifact = /^ {10}name: (\S+)$/m.exec(upload)?.[1];

    expect(/^ {4}needs: \[(.*)\]$/m.exec(job)?.[1]?.split(', ')).toContain('siglip-model');
    expect(provider).toMatch(/run: bash scripts\/pull-siglip-model\.sh$/m);
    expect(
      ['schedule', 'workflow_dispatch', 'pull_request'].map((e) => runsOn(e, provider)),
    ).toEqual(['schedule', 'workflow_dispatch', 'pull_request'].map((e) => runsOn(e)));
    expect(artifact).toBeDefined();
    expect(steps[download]).toContain(`name: ${artifact}`);
    expect(steps[download]).toMatch(/^ {10}path: museum-backend\/models$/m);
    expect(download).toBeLessThan(steps.indexOf(step('Boot backend')));
    expect(step('Boot backend')).toMatch(/^ {10}CHAT_COMPARE_PROVISION: '1'$/m);
  });
});
