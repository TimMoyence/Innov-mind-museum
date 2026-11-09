import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');
const SET_ENV = resolve(process.cwd(), 'deploy/vps/set-env.sh');
const GROUP = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();
const GID = Number(spawnSync('id', ['-g'], { encoding: 'utf8' }).stdout.trim());

const ORIGINAL = ['JWT_SECRET=a$b"c`d', 'IMAGE_TAG=old', 'REDIS_PASSWORD=before', ''].join('\n');

let dir;

const run = (...args) =>
  spawnSync('bash', [SET_ENV, ...args], {
    env: { PATH: '/usr/bin:/bin', MUSAIUM_DIR: dir, ENV_GROUP: GROUP },
    encoding: 'utf8',
  });

const envFile = () => join(dir, '.env');
const backups = () => readdirSync(join(dir, 'env-backups'));
const mode = (path) => statSync(path).mode & 0o777;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vps-env-'));
  writeFileSync(envFile(), ORIGINAL, { mode: 0o644 });
});

describe('VPS-ENV', () => {
  it('VPS-ENV · remplace la clé sans toucher aux autres lignes', () => {
    const result = run('IMAGE_TAG', 'new');

    expect(result.status).toBe(0);
    expect(readFileSync(envFile(), 'utf8').split('\n').sort()).toEqual(
      ['JWT_SECRET=a$b"c`d', 'IMAGE_TAG=new', 'REDIS_PASSWORD=before', ''].sort(),
    );
  });

  it('VPS-ENV · ajoute une clé absente', () => {
    run('WEB_IMAGE_TAG', 'abc');

    expect(readFileSync(envFile(), 'utf8')).toBe(`${ORIGINAL}WEB_IMAGE_TAG=abc\n`);
  });

  it('VPS-ENV · le .env reste lisible du seul groupe docker', () => {
    run('IMAGE_TAG', 'new');

    expect(mode(envFile())).toBe(0o640);
    expect(statSync(envFile()).gid).toBe(GID);
  });

  it('VPS-ENV · garde une copie de l’ancien .env que seul root lit', () => {
    run('IMAGE_TAG', 'new');
    const copies = backups();

    expect(mode(join(dir, 'env-backups'))).toBe(0o700);
    expect(copies).toHaveLength(1);
    expect(mode(join(dir, 'env-backups', copies[0]))).toBe(0o600);
    expect(readFileSync(join(dir, 'env-backups', copies[0]), 'utf8')).toBe(ORIGINAL);
  });

  it('VPS-ENV · refuse une valeur sur plusieurs lignes et laisse le .env intact', () => {
    const result = run('IMAGE_TAG', 'new\nINJECTED=1');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/IMAGE_TAG refusé : valeur sur plusieurs lignes/);
    expect(readFileSync(envFile(), 'utf8')).toBe(ORIGINAL);
  });

  it('VPS-ENV · n’affiche jamais la valeur écrite', () => {
    const result = run('REDIS_PASSWORD', 'S3cretValue');

    expect(result.status).toBe(0);
    expect(readFileSync(envFile(), 'utf8')).toContain('REDIS_PASSWORD=S3cretValue\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain('S3cretValue');
  });

  it.each([
    ['.github/workflows/ci-cd-backend.yml', 'IMAGE_TAG'],
    ['.github/workflows/ci-cd-web.yml', 'WEB_IMAGE_TAG'],
    ['museum-backend/deploy/rollback.sh', 'IMAGE_TAG'],
  ])('VPS-ENV · %s écrit %s par set-env.sh et jamais à la main', (file, key) => {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    const handWrites = text
      .split('\n')
      .filter(
        (line) =>
          (/(\btee\b|sed -i|\bmv\b)/.test(line) && /(ENV_FILE|\/srv\/museum\/\.env)/.test(line)) ||
          />>?\s*"?(\$\{?ENV_FILE\}?|\/srv\/museum\/\.env)/.test(line),
      );

    expect(text).toMatch(new RegExp(`set-env\\.sh ${key} "`));
    expect(handWrites).toEqual([]);
    expect(
      text
        .split('\n')
        .filter((line) => line.includes('.museum-env-backups') && !/rm -rf/.test(line)),
    ).toEqual([]);
  });
});
