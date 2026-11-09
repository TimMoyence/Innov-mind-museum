import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach } from '@jest/globals';

const SET_ENV = resolve(process.cwd(), 'deploy/vps/set-env.sh');
const GROUP = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();
const DAY = 24 * 60 * 60;

let dir;

const env = (extra = {}) => ({
  PATH: '/usr/bin:/bin',
  MUSAIUM_DIR: dir,
  ENV_GROUP: GROUP,
  ...extra,
});

const runAsync = (key, value) =>
  new Promise((done) => {
    const child = spawn('bash', [SET_ENV, key, value], { env: env() });
    child.on('close', done);
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vps-env-lock-'));
  writeFileSync(join(dir, '.env'), 'IMAGE_TAG=old\n');
});

describe('VPS-ENV-LOCK', () => {
  it('VPS-ENV-LOCK · vingt écritures simultanées gardent toutes leurs clés', async () => {
    const keys = Array.from({ length: 20 }, (_, i) => `KEY_${i}`);

    await Promise.all(keys.map((key) => runAsync(key, `value-${key}`)));
    const lines = readFileSync(join(dir, '.env'), 'utf8').split('\n');

    expect(keys.filter((key) => !lines.includes(`${key}=value-${key}`))).toEqual([]);
    expect(lines).toContain('IMAGE_TAG=old');
  });

  it('VPS-ENV-LOCK · un verrou resté tenu fait refuser l’écriture en le nommant', () => {
    mkdirSync(join(dir, '.env.lock'));

    const result = spawnSync('bash', [SET_ENV, 'IMAGE_TAG', 'new'], {
      env: env({ SET_ENV_LOCK_TRIES: '2' }),
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${join(dir, '.env.lock')} reste tenu`);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('IMAGE_TAG=old\n');
  });

  it('VPS-ENV-LOCK · purge les copies de plus de 30 jours et garde les récentes', () => {
    mkdirSync(join(dir, 'env-backups'), { mode: 0o700 });
    const old = join(dir, 'env-backups', '.env.20260901T000000Z.aaaaaa');
    const recent = join(dir, 'env-backups', '.env.20261104T000000Z.bbbbbb');
    writeFileSync(old, 'IMAGE_TAG=very-old\n');
    writeFileSync(recent, 'IMAGE_TAG=recent\n');
    const now = Date.now() / 1000;
    utimesSync(old, now - 40 * DAY, now - 40 * DAY);
    utimesSync(recent, now - 5 * DAY, now - 5 * DAY);

    const result = spawnSync('bash', [SET_ENV, 'IMAGE_TAG', 'new'], {
      env: env(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });
});
