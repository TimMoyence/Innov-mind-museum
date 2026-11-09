import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { captureExceptionWithContext } from '@shared/observability/sentry';
import { reportBullmqErrors } from '@shared/queue/bullmq-errors';

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

const BACKEND = resolve(__dirname, '../../../..');

class NamedEmitter extends EventEmitter {
  constructor(readonly name: string) {
    super();
  }
}

describe('BULLMQ-ERRORS', () => {
  it('BULLMQ-ERRORS · une erreur de connexion part chez Sentry au lieu d’être levée sans écouteur', () => {
    const queue = reportBullmqErrors(
      new NamedEmitter('museum-enrichment-scheduler'),
      'queue_error',
    );
    const error = new Error('Connection is closed.');

    expect(() => queue.emit('error', error)).not.toThrow();
    expect(captureExceptionWithContext).toHaveBeenCalledWith(error, {
      queue: 'museum-enrichment-scheduler',
      kind: 'queue_error',
    });
  });

  it('BULLMQ-ERRORS · chaque Queue et chaque Worker de BullMQ passe par reportBullmqErrors', () => {
    const files = spawnSync('git', ['grep', '-lE', 'new (Queue|Worker)[<(]', '--', 'src'], {
      cwd: BACKEND,
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .filter(Boolean);
    const unreported = files.flatMap((file) => {
      const text = readFileSync(resolve(BACKEND, file), 'utf8');
      const created = text.match(/new (Queue|Worker)[<(]/g)?.length ?? 0;
      const reported = text.match(/reportBullmqErrors\(/g)?.length ?? 0;
      return created === reported ? [] : [`${file} : ${created} créés, ${reported} suivis`];
    });

    expect(files.length).toBeGreaterThan(0);
    expect(unreported).toEqual([]);
  });
});
