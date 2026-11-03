import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const DEPLOY = resolve(process.cwd(), 'deploy');
const COMPOSE_IMAGE = /image:\s*(pgvector\/pgvector:pg16@sha256:[0-9a-f]{64})/.exec(
  readFileSync(join(DEPLOY, 'docker-compose.prod.yml'), 'utf8'),
)[1];

const STUB = `#!/usr/bin/env bash
printf '%s %s\\n' "$(basename "$0")" "$*" >> "$STUB_LOG"
cat > /dev/null
case "$(basename "$0")" in
  s5cmd) printf '2026/11/01 02:15:01  100 2026-11-01.pgdump.gpg\\n2026/11/02 02:15:01  120 2026-11-02.pgdump.gpg\\n' ;;
  docker) printf '%b' "\${STUB_DOCKER_OUT:-73\\n}" ;;
esac
`;

function restore(dockerOut) {
  const home = mkdtempSync(join(tmpdir(), 'restore-check-'));
  const log = join(home, 'calls.log');
  mkdirSync(join(home, 'bin'));
  for (const name of ['docker', 'gpg', 's5cmd']) {
    writeFileSync(join(home, 'bin', name), STUB);
    chmodSync(join(home, 'bin', name), 0o755);
  }
  const envFile = join(home, 'restore.env');
  writeFileSync(
    envFile,
    'S3_BUCKET=museum-storage-image\nS3_ENDPOINT=https://s3.eu-west-par.io.cloud.ovh.net/\nS3_REGION=eu-west-par\nS3_ACCESS_KEY_ID=key\nS3_SECRET_ACCESS_KEY=secret\n',
  );
  const result = spawnSync('bash', [join(DEPLOY, 'restore-check.sh'), envFile], {
    env: {
      PATH: `${join(home, 'bin')}:/usr/bin:/bin`,
      HOME: home,
      STUB_LOG: log,
      ...(dockerOut === undefined ? {} : { STUB_DOCKER_OUT: dockerOut }),
    },
    encoding: 'utf8',
    input: '',
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { code: result.status, calls };
}

describe('RAZ-M11b-VPS-LAYOUT', () => {
  it('RAZ-M11b-VPS-LAYOUT · la restauration de contrôle tourne sur le poste qui détient la clé privée, depuis le dépôt, avec son fichier d’environnement', () => {
    const { code, calls } = restore();

    expect(code).toBe(0);
    expect(calls).toContain(
      `docker run -d --name musaium-restore-check -e POSTGRES_PASSWORD=restore-check ${COMPOSE_IMAGE}`,
    );
    expect(calls).toContain(
      's5cmd --endpoint-url https://s3.eu-west-par.io.cloud.ovh.net/ cat s3://museum-storage-image/backups/daily/2026-11-02.pgdump.gpg',
    );
    expect(calls).toContain('gpg --batch --decrypt');
    expect(calls).toContain('docker exec musaium-restore-check pg_isready -h 127.0.0.1 -U postgres');
    expect(calls.at(-1)).toBe('docker rm -f musaium-restore-check');
  });

  it('RAZ-M11b-VPS-LAYOUT · une restauration sans aucune migration chargée échoue et supprime quand même le Postgres jetable', () => {
    const { code, calls } = restore('0\\n');

    expect(code).not.toBe(0);
    expect(calls.at(-1)).toBe('docker rm -f musaium-restore-check');
  });

  it('RAZ-M11b-VPS-LAYOUT · le script de restauration n’est plus installé sur le VPS, qui n’a pas la clé privée', () => {
    expect(existsSync(join(DEPLOY, 'vps/restore-check.sh'))).toBe(false);
  });
});
