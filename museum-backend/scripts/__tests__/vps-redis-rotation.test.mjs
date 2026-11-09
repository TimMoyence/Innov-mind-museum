import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');
const ROTATE = resolve(process.cwd(), 'deploy/vps/rotate-redis-password.sh');
const GROUP = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();

const OLD_PASSWORD = 'OldRedisPassword0123456789abcdefOldRedisPassword';

const DOCKER_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_LOG"
case "$*" in
  *" exec "*) [ -n "\${STUB_PING_FAIL:-}" ] && exit 1; printf 'PONG\\n' ;;
  *" logs "*) printf '%b' "\${STUB_LOGS:-}" ;;
esac
exit 0
`;

let dir;

const envFile = () => join(dir, '.env');
const setting = (key) =>
  readFileSync(envFile(), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith(`${key}=`))
    .map((line) => line.slice(key.length + 1));

const run = (env = {}) => {
  const result = spawnSync('bash', [ROTATE], {
    env: {
      PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
      MUSAIUM_DIR: dir,
      ENV_GROUP: GROUP,
      STUB_LOG: join(dir, 'docker.log'),
      NOAUTH_WAIT_SECONDS: '0',
      ...env,
    },
    encoding: 'utf8',
  });
  const calls = existsSync(join(dir, 'docker.log'))
    ? readFileSync(join(dir, 'docker.log'), 'utf8').trim().split('\n')
    : [];
  return { ...result, calls };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vps-redis-'));
  spawnSync('mkdir', ['-p', join(dir, 'bin')]);
  writeFileSync(join(dir, 'bin', 'docker'), DOCKER_STUB);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  writeFileSync(
    envFile(),
    [
      'JWT_SECRET=keep-me',
      `REDIS_PASSWORD=${OLD_PASSWORD}`,
      `REDIS_URL=redis://:${OLD_PASSWORD}@redis:6379`,
      'IMAGE_TAG=abc',
      '',
    ].join('\n'),
  );
});

describe('VPS-REDIS-ROTATION', () => {
  it('VPS-REDIS-ROTATION · tire 48 caractères alphanumériques et les écrit dans REDIS_PASSWORD et REDIS_URL', () => {
    const result = run();
    const [password] = setting('REDIS_PASSWORD');

    expect(result.status).toBe(0);
    expect(password).toMatch(/^[A-Za-z0-9]{48}$/);
    expect(password).not.toBe(OLD_PASSWORD);
    expect(setting('REDIS_URL')).toEqual([`redis://:${password}@redis:6379`]);
    expect(setting('JWT_SECRET')).toEqual(['keep-me']);
    expect(setting('IMAGE_TAG')).toEqual(['abc']);
  });

  it('VPS-REDIS-ROTATION · laisse REDIS_URL tel quel s’il ne porte pas de mot de passe', () => {
    writeFileSync(envFile(), `REDIS_PASSWORD=${OLD_PASSWORD}\nREDIS_URL=redis://redis:6379\n`);

    const result = run();

    expect(result.status).toBe(0);
    expect(setting('REDIS_PASSWORD')[0]).toMatch(/^[A-Za-z0-9]{48}$/);
    expect(setting('REDIS_PASSWORD')).not.toEqual([OLD_PASSWORD]);
    expect(setting('REDIS_URL')).toEqual(['redis://redis:6379']);
  });

  it('VPS-REDIS-ROTATION · recrée redis puis le backend et attend qu’ils soient sains', () => {
    const { calls } = run();
    const ups = calls.filter((call) => call.includes(' up '));

    expect(ups).toHaveLength(2);
    expect(ups[0]).toMatch(/--wait.* redis$/);
    expect(ups[1]).toMatch(/--wait.* backend$/);
  });

  it.each([
    ['Redis refuse le nouveau mot de passe', { STUB_PING_FAIL: '1' }],
    [
      'le backend journalise NOAUTH',
      { STUB_LOGS: 'ReplyError: NOAUTH Authentication required.\\n' },
    ],
  ])('VPS-REDIS-ROTATION · %s : remet l’ancien mot de passe, recrée et échoue', (cause, env) => {
    const result = run(env);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/rotation annulée/);
    expect(setting('REDIS_PASSWORD')).toEqual([OLD_PASSWORD]);
    expect(setting('REDIS_URL')).toEqual([`redis://:${OLD_PASSWORD}@redis:6379`]);
    expect(result.calls.filter((call) => call.includes(' up '))).toHaveLength(4);
  });

  it('VPS-REDIS-ROTATION · le mot de passe n’apparaît ni dans la sortie ni dans les arguments de docker', () => {
    const result = run();
    const [password] = setting('REDIS_PASSWORD');

    expect(result.status).toBe(0);
    expect(password).not.toBe(OLD_PASSWORD);
    expect(`${result.stdout}${result.stderr}${result.calls.join('\n')}`).not.toContain(password);
    expect(`${result.stdout}${result.stderr}${result.calls.join('\n')}`).not.toContain(
      OLD_PASSWORD,
    );
  });

  it('VPS-REDIS-ROTATION · le workflow backend lance la rotation à la main par le compte de déploiement', () => {
    const backend = readFileSync(join(REPO_ROOT, '.github/workflows/ci-cd-backend.yml'), 'utf8');
    const job =
      backend
        .split(/^(?= {2}[a-z][a-z0-9-]*:$)/m)
        .find((block) => block.startsWith('  rotate-redis-password:')) ?? '';

    expect(backend).toMatch(
      /^ {6}rotate_redis_password:\n {8}description: .+\n {8}type: boolean\n {8}default: false$/m,
    );
    expect(job).toMatch(
      /^ {4}if: \$\{\{ github\.event_name == 'workflow_dispatch' && .*inputs\.rotate_redis_password \}\}$/m,
    );
    expect(job).not.toMatch(/^ {4}needs:/m);
    expect(job).toMatch(/username: \$\{\{ secrets\.SERVER_USER \}\}/);
    expect(job).toMatch(/sudo \/srv\/museum\/vps\/rotate-redis-password\.sh$/m);
    expect(backend).toMatch(/chmod \+x .*\/srv\/museum\/vps\/rotate-redis-password\.sh/);
  });
});
