import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const BACKEND_ROOT = join(__dirname, '..', '..', '..');
const PROBE = join(BACKEND_ROOT, 'tests/fixtures/otel/structured-output-probe.ts');

const probe = async (otelEnabled: boolean): Promise<unknown> => {
  const { stdout } = await run(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', PROBE],
    {
      cwd: BACKEND_ROOT,
      env: {
        PATH: process.env.PATH,
        PGDATABASE: 'probe',
        NODE_ENV: 'development',
        OTEL_ENABLED: String(otelEnabled),
        OTEL_EXPORTER_ENDPOINT: 'http://127.0.0.1:9',
      },
    },
  );
  const line = stdout.split('\n').find((entry) => entry.startsWith('PROBE_RESULT '));
  return JSON.parse(line?.slice('PROBE_RESULT '.length) ?? 'null');
};

describe('OpenTelemetry and structured LLM output', () => {
  it('answers a structured-output call with telemetry off', async () => {
    await expect(probe(false)).resolves.toEqual({ ok: true, answer: 'probe-ok' });
  }, 60_000);

  it('answers a structured-output call with telemetry on, as in production', async () => {
    await expect(probe(true)).resolves.toEqual({ ok: true, answer: 'probe-ok' });
  }, 60_000);
});
