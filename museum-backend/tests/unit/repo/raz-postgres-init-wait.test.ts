import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { waitForPostgresInit } from 'tests/helpers/e2e/postgres-testcontainer';

const READY = 'LOG:  database system is ready to accept connections';

const withFakeDockerLogs = async (lines: string[], run: () => Promise<void>): Promise<void> => {
  const bin = mkdtempSync(join(tmpdir(), 'fake-docker-'));
  const previousPath = process.env.PATH;
  try {
    const fake = join(bin, 'docker');
    writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' ${lines.map((l) => `'${l}'`).join(' ')} >&2\n`);
    chmodSync(fake, 0o755);
    process.env.PATH = `${bin}:${previousPath ?? ''}`;
    await run();
  } finally {
    process.env.PATH = previousPath;
    rmSync(bin, { recursive: true, force: true });
  }
};

describe('RAZ-M19-PG-INIT-WAIT', () => {
  it('RAZ-M19-PG-INIT-WAIT · le serveur temporaire d’initialisation ne suffit pas à déclarer Postgres prêt', async () => {
    await withFakeDockerLogs(['init', READY, 'shutting down'], async () => {
      await expect(waitForPostgresInit('container', 3)).rejects.toThrow(/initialis/);
    });
  });

  it('RAZ-M19-PG-INIT-WAIT · Postgres est prêt après le redémarrage qui suit l’initialisation', async () => {
    await withFakeDockerLogs(['init', READY, 'shutting down', READY], async () => {
      await expect(waitForPostgresInit('container', 3)).resolves.toBeUndefined();
    });
  });
});
