/**
 * W3-05 (RED) — docker-compose.dev.yml weaknet structural test.
 *
 * spec.md §EARS R3 + design.md §Architecture (3): a `toxiproxy` service is added
 * to `museum-backend/docker-compose.dev.yml` UNDER `profiles: [weaknet]` so the
 * everyday `pnpm dev` (default profile) is byte-unchanged. Invariants asserted:
 *   - a `toxiproxy` service exists;
 *   - it is gated behind `profiles:` containing `weaknet` (NOT started by default);
 *   - it exposes the shaped port `3100` and the admin port `8474`;
 *   - it points upstream at the `backend` service;
 *   - the everyday services (backend / db / redis / adminer) carry NO `weaknet`
 *     profile gate (they still start with a plain `pnpm dev`).
 *
 * No YAML dependency is available in the backend toolchain, so we slice the file
 * into top-level service blocks by indentation (the `services:` map, 2-space keys)
 * and assert against the relevant block's body — stronger than a whole-file
 * `.includes('toxiproxy')`, which would pass on a mere comment.
 *
 * RED state: the compose file has no `toxiproxy` service block yet → the slice is
 * undefined → every assertion on it fails for the right reason.
 *
 * Runtime-deferred (UFR-013): W3-06/07 (Maestro netshape flows + maestro-netshape
 * CI job + compression wall-clock metric) are NIGHTLY-only and are NOT covered by
 * this unit test — bringing the proxy up against a real device needs an emulator.
 *
 * lib-docs: none — node:fs / node:path (stdlib only). No external library
 *   imported. No inline test entities; the compose file on disk is the source of
 *   truth.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = museum-backend/tests/unit/net-shaping → backend root is three up.
const BACKEND_ROOT = join(__dirname, '..', '..', '..');
const COMPOSE_PATH = join(BACKEND_ROOT, 'docker-compose.dev.yml');

/**
 * Returns the raw text body of a top-level service block (everything indented
 * under `  <name>:` within the `services:` map, up to the next 2-space key or a
 * column-0 key like `volumes:`). Returns `undefined` if the service is absent.
 * @param source
 * @param name
 */
function serviceBlock(source: string, name: string): string | undefined {
  const lines = source.split('\n');
  const header = new RegExp(`^  ${name}:\\s*$`);
  const startIdx = lines.findIndex((line) => header.test(line));
  if (startIdx === -1) {
    return undefined;
  }
  const body: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // A 2-space-indented key OR a column-0 key ends the current service block.
    const isNextServiceKey = /^ {2}\S/.test(line);
    const isTopLevelKey = /^\S/.test(line) && line.trim().length > 0;
    if (isNextServiceKey || isTopLevelKey) {
      break;
    }
    body.push(line);
  }
  return body.join('\n');
}

describe('docker-compose.dev.yml weaknet structural contract (W3-05)', () => {
  const source = readFileSync(COMPOSE_PATH, 'utf8');
  const toxiproxyBlock = serviceBlock(source, 'toxiproxy');

  it('defines a toxiproxy service', () => {
    expect(toxiproxyBlock).toBeDefined();
  });

  it('gates toxiproxy behind a profiles entry containing weaknet (off by default)', () => {
    expect(toxiproxyBlock ?? '').toMatch(/profiles:/);
    expect(toxiproxyBlock ?? '').toMatch(/weaknet/);
  });

  it('exposes the shaped port 3100 and the admin port 8474', () => {
    expect(toxiproxyBlock ?? '').toMatch(/3100/);
    expect(toxiproxyBlock ?? '').toMatch(/8474/);
  });

  it('points upstream at the backend service', () => {
    expect(toxiproxyBlock ?? '').toMatch(/backend/);
  });

  it('leaves the everyday services ungated (no weaknet profile)', () => {
    for (const name of ['backend', 'db', 'redis', 'adminer']) {
      const block = serviceBlock(source, name);
      expect(block).toBeDefined();
      expect(block ?? '').not.toMatch(/weaknet/);
    }
  });
});
