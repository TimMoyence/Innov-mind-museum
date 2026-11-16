import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BACKEND = process.cwd();
const WORKFLOW = readFileSync(
  resolve(BACKEND, '..', '.github/workflows/ci-cd-backend.yml'),
  'utf8',
);

const DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_DIR/docker.log"
count="$STUB_DIR/db-count"
pending="$STUB_DIR/db-pending"
case "$*" in
  "compose pull"*) [ -z "\${STUB_PULL_FAIL:-}" ] ;;
  "compose exec -T db sh -c "*)
    POSTGRES_USER=museum POSTGRES_DB=musaium POSTGRES_PASSWORD=secret PATH="$STUB_DIR/db-bin:$PATH" sh -c "$7" "$8" "$9" ;;
  *"node dist/src/data/db/run-migrations.js"*)
    echo $(( $(sed 's/absent/0/' "$count") + $(cat "$pending") )) > "$count"; echo 0 > "$pending" ;;
  *"migration:revert"*) echo $(( $(cat "$count") - 1 )) > "$count" ;;
  *" node -e "*|*"node dist/scripts/seed-"*|"compose up"*|"compose -f docker-compose.yml up"*|"login"*) ;;
  *" node "*) echo "Error: Cannot find module '$*'" >&2; exit 1 ;;
esac
`;

const PSQL = `#!/usr/bin/env bash
[ -z "\${STUB_DB_DOWN:-}" ] || { echo 'psql: could not connect to server' >&2; exit 2; }
[ "$PGPASSWORD" = secret ] && [ "$1 $2 $3 $4 $5" = '-U museum -d musaium -tAc' ] \\
  || { echo "psql: refused $*" >&2; exit 2; }
count="$(cat "$STUB_DIR/db-count")"
case "$6" in
  "SELECT to_regclass('migrations') IS NOT NULL") [ "$count" = absent ] && echo f || echo t ;;
  'SELECT count(*) FROM migrations')
    [ "$count" != absent ] || { echo 'ERROR:  relation "migrations" does not exist' >&2; exit 1; }
    echo "$count" ;;
  *) echo "psql: refused $6" >&2; exit 2 ;;
esac
`;

const SUDO = `#!/usr/bin/env bash
case "$1" in *set-env.sh) exit 0 ;; esac
exec "$@"
`;

export const workflowScript = (step) => {
  const lines = WORKFLOW.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${step}`);
  const body = lines.slice(
    lines.findIndex((line, i) => i > start && line.trim() === 'script: |') + 1,
  );
  const indent = body[0].search(/\S/);
  const end = body.findIndex((line) => line.trim() !== '' && line.search(/\S/) < indent);
  return body
    .slice(0, end)
    .map((line) => line.slice(indent))
    .join('\n');
};

export const vps = ({ migrations, pending }) => {
  const dir = mkdtempSync(join(tmpdir(), 'vps-deploy-'));
  const onVps = (text) => text.replaceAll('/srv/museum', dir).replace(/\$\{\{[^}]*\}\}/g, 'org');
  const write = (path, text) => writeFileSync(join(dir, path), text, { mode: 0o755 });
  ['bin', 'db-bin', 'vps'].forEach((folder) => mkdirSync(join(dir, folder)));
  write('bin/docker', DOCKER);
  write('bin/sudo', SUDO);
  write('db-bin/psql', PSQL);
  readdirSync(resolve(BACKEND, 'deploy/vps')).forEach((file) =>
    write(`vps/${file}`, onVps(readFileSync(resolve(BACKEND, 'deploy/vps', file), 'utf8'))),
  );
  write('rollback.sh', onVps(readFileSync(resolve(BACKEND, 'deploy/rollback.sh'), 'utf8')));
  write('.env', 'IMAGE_TAG=previous\n');
  write('db-count', `${migrations}\n`);
  write('db-pending', `${pending}\n`);

  const bash = (args, env) =>
    spawnSync('bash', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
        HOME: dir,
        STUB_DIR: dir,
        GHCR_TOKEN: 'token',
        GHCR_USER: 'org',
        IMAGE_TAG: 'next',
        ...env,
      },
    });
  const read = (path) => readFileSync(join(dir, path), 'utf8');

  return {
    capture: (env) =>
      bash(['-c', onVps(workflowScript('Capture pre-deploy rollback state (prod)'))], env),
    deploy: (env) => bash(['-c', onVps(workflowScript('Deploy on VPS (zero-downtime)'))], env),
    rollback: (env) => bash([join(dir, 'rollback.sh'), 'docker-compose.yml', 'backend'], env),
    migrations: () => Number(read('db-count')),
    appliedCount: () => read('.museum-rollback/backend/applied-count.txt').trim(),
    reverts: () =>
      read('docker.log')
        .split('\n')
        .filter((line) => line.includes('migration:revert')).length,
  };
};
