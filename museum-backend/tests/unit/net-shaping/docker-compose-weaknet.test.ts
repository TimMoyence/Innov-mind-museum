import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKEND_ROOT = join(__dirname, '..', '..', '..');
const COMPOSE_PATH = join(BACKEND_ROOT, 'docker-compose.dev.yml');

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
