import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach } from '@jest/globals';

const VPS_DIR = resolve(process.cwd(), 'deploy/vps');

const STUB = `#!/usr/bin/env bash
name="$(basename "$0")"
printf '%s %s\\n' "$name" "$*" >> "$STUB_LOG"
key="STUB_$(printf '%s' "$name" | tr '[:lower:]-' '[:upper:]_')"
out="\${key}_OUT"
code="\${key}_EXIT"
cat > /dev/null
[ -n "\${!out:-}" ] && printf '%b' "\${!out}"
exit "\${!code:-0}"
`;

let work;
let log;

function run(script, env = {}) {
  const result = spawnSync('bash', [join(VPS_DIR, script)], {
    env: {
      PATH: `${join(work, 'bin')}:/usr/bin:/bin`,
      HOME: work,
      STUB_LOG: log,
      MUSAIUM_DIR: work,
      ...env,
    },
    encoding: 'utf8',
    input: '',
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { code: result.status, calls, stderr: result.stderr };
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'vps-cron-'));
  log = join(work, 'calls.log');
  spawnSync('mkdir', ['-p', join(work, 'bin')]);
  for (const name of ['docker', 'gpg', 's5cmd', 'curl']) {
    writeFileSync(join(work, 'bin', name), STUB);
    chmodSync(join(work, 'bin', name), 0o755);
  }
  writeFileSync(
    join(work, 'backup.env'),
    [
      'BACKUP_GPG_RECIPIENT=ops@musaium.com',
      'BACKUP_HEARTBEAT_URL=https://hb.example/backup',
      'CERT_HEARTBEAT_URL=https://hb.example/cert',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(work, '.env'),
    [
      'JWT_SECRET=a$b"c`d',
      'S3_ENDPOINT=https://s3.eu-west-par.io.cloud.ovh.net/',
      'S3_REGION=eu-west-par',
      'S3_BUCKET="museum-storage-image"',
      'S3_ACCESS_KEY_ID=key',
      'S3_SECRET_ACCESS_KEY=secret',
      '',
    ].join('\n'),
  );
});

describe('RAZ-M11b-VPS-CRON', () => {
  it('RAZ-M11b-VPS-CRON · la sauvegarde quotidienne dump la base dans le conteneur, chiffre, envoie puis pingue son heartbeat', () => {
    const { code, calls } = run('backup-db.sh');
    const today = new Date().toISOString().slice(0, 10);

    expect(code).toBe(0);
    expect(calls.slice(0, 2).sort()).toEqual([
      expect.stringMatching(
        /^docker compose exec -T db sh -c PGPASSWORD="\$POSTGRES_PASSWORD" pg_dump -U "\$POSTGRES_USER" .*--format=custom/,
      ),
      expect.stringMatching(/^gpg .*--encrypt --recipient ops@musaium\.com/),
    ]);
    expect(calls[2]).toMatch(
      new RegExp(
        `^s5cmd --endpoint-url https://s3\\.eu-west-par\\.io\\.cloud\\.ovh\\.net/ cp \\S+ s3://museum-storage-image/backups/daily/${today}\\.pgdump\\.gpg$`,
      ),
    );
    expect(calls[3]).toBe('curl -fsS --max-time 10 https://hb.example/backup');
  });

  it('RAZ-M11b-VPS-CRON · un dump en échec n’envoie rien et signale l’échec au heartbeat', () => {
    const { code, calls } = run('backup-db.sh', { STUB_DOCKER_EXIT: '1' });

    expect(code).not.toBe(0);
    expect(calls.some((call) => call.startsWith('s5cmd'))).toBe(false);
    expect(calls.at(-1)).toBe('curl -fsS --max-time 10 -X POST https://hb.example/backup/fail');
  });

  it('RAZ-M11b-VPS-CRON · des certificats valides plus de 21 jours pinguent le heartbeat sans rien renouveler', () => {
    const { code, calls } = run('check-certs.sh', {
      STUB_DOCKER_OUT:
        '    Expiry Date: 2027-01-04 (VALID: 61 days)\\n    Expiry Date: 2027-01-28 (VALID: 86 days)\\n',
    });

    expect(code).toBe(0);
    expect(calls).toEqual([
      'docker exec reverse-proxy-certbot-1 certbot certificates',
      'curl -fsS --max-time 10 https://hb.example/cert',
    ]);
  });

  it.each([
    [
      'un certificat à 2 jours',
      '    Expiry Date: 2026-11-05 (VALID: 2 days)\\n    Expiry Date: 2027-01-04 (VALID: 61 days)\\n',
    ],
    [
      'un certificat expiré',
      '    Expiry Date: 2026-10-01 (INVALID: EXPIRED)\\n    Expiry Date: 2027-01-04 (VALID: 61 days)\\n',
    ],
    [
      'un certificat à quelques heures',
      '    Expiry Date: 2026-11-05 (VALID: 5 hour(s))\\n    Expiry Date: 2027-01-04 (VALID: 61 days)\\n',
    ],
    ['aucun certificat lisible', ''],
  ])('RAZ-M11b-VPS-CRON · %s signale l’échec au heartbeat', (_label, certificates) => {
    const { code, calls } = run('check-certs.sh', { STUB_DOCKER_OUT: certificates });

    expect(code).not.toBe(0);
    expect(calls).toEqual([
      'docker exec reverse-proxy-certbot-1 certbot certificates',
      'curl -fsS --max-time 10 -X POST https://hb.example/cert/fail',
    ]);
  });

  it.each([
    ['backup-db.sh', 'BACKUP_HEARTBEAT_URL', {}],
    [
      'check-certs.sh',
      'CERT_HEARTBEAT_URL',
      { STUB_DOCKER_OUT: '    Expiry Date: 2027-01-04 (VALID: 61 days)\\n' },
    ],
  ])(
    'RAZ-M11b-VPS-CRON · %s réussit sans heartbeat configuré et dit lequel manque',
    (script, variable, env) => {
      writeFileSync(
        join(work, 'backup.env'),
        [
          'BACKUP_GPG_RECIPIENT=ops@musaium.com',
          'BACKUP_HEARTBEAT_URL=',
          'CERT_HEARTBEAT_URL=',
          '',
        ].join('\n'),
      );

      const { code, calls, stderr } = run(script, env);

      expect(code).toBe(0);
      expect(calls.some((call) => call.startsWith('curl'))).toBe(false);
      expect(stderr).toContain(`heartbeat non configuré : ${variable} est vide`);
    },
  );

  it('RAZ-M11b-VPS-CRON · un backup.env qui ne déclare pas le heartbeat laisse check-certs réussir et nomme la variable', () => {
    writeFileSync(join(work, 'backup.env'), 'BACKUP_GPG_RECIPIENT=ops@musaium.com\n');

    const { code, calls, stderr } = run('check-certs.sh', {
      STUB_DOCKER_OUT: '    Expiry Date: 2027-01-04 (VALID: 61 days)\\n',
    });

    expect(code).toBe(0);
    expect(calls.some((call) => call.startsWith('curl'))).toBe(false);
    expect(stderr).toContain('heartbeat non configuré : CERT_HEARTBEAT_URL est vide');
  });

  it('RAZ-M11b-VPS-CRON · sans heartbeat configuré, un dump en échec échoue quand même', () => {
    writeFileSync(
      join(work, 'backup.env'),
      [
        'BACKUP_GPG_RECIPIENT=ops@musaium.com',
        'BACKUP_HEARTBEAT_URL=',
        'CERT_HEARTBEAT_URL=',
        '',
      ].join('\n'),
    );

    const { code, calls } = run('backup-db.sh', { STUB_DOCKER_EXIT: '1' });

    expect(code).not.toBe(0);
    expect(calls.some((call) => call.startsWith('s5cmd') || call.startsWith('curl'))).toBe(false);
  });

  it('RAZ-M11b-VPS-CRON · le cron du VPS trouve s5cmd dans /usr/local/bin, lance la sauvegarde et le contrôle des certificats chaque nuit', () => {
    const cron = readFileSync(join(VPS_DIR, 'musaium.cron'), 'utf8').trim().split('\n');

    expect(cron).toEqual([
      'PATH=/usr/local/bin:/usr/bin:/bin',
      '15 2 * * * root /srv/museum/vps/backup-db.sh >> /var/log/musaium-backup.log 2>&1',
      '30 3 * * * root /srv/museum/vps/check-certs.sh >> /var/log/musaium-cert.log 2>&1',
    ]);
  });

  it('RAZ-M11b-VPS-CRON · aucun script suivi n’appelle un heartbeat sans passer par heartbeat()', () => {
    const repoRoot = resolve(process.cwd(), '..');
    const scripts = spawnSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '*.sh'],
      { cwd: repoRoot, encoding: 'utf8' },
    )
      .stdout.split('\n')
      .filter((file) => file && existsSync(join(repoRoot, file)));
    const direct = scripts.filter((file) => {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      return /HEARTBEAT_URL/.test(text) && /\bcurl\b/.test(text);
    });

    expect(direct).toEqual([]);
  });
});
