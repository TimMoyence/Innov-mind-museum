import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { SearxngClient } from '@modules/chat/adapters/secondary/search/searxng.client';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const STUB = join(__dirname, '../../../../museum-frontend/scripts/maestro-searxng-stub.mjs');
const INSTANCE = 'http://127.0.0.1:8890';

async function waitUntilListening(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const listening = await fetch(INSTANCE).then(
      () => true,
      () => false,
    );
    if (listening) return;
    await delay(100);
  }
}

describe('faux moteur SearXNG du runner Maestro', () => {
  let stub: ChildProcess;
  const client = new SearxngClient([INSTANCE]);

  beforeAll(async () => {
    stub = spawn(process.execPath, [STUB], { stdio: 'ignore' });
    await waitUntilListening();
  });

  afterAll(() => {
    stub.kill();
  });

  it('MAESTRO-CHAT · la question du flow sur la Joconde rend la page Wikipédia comme source', async () => {
    const results = await client.search({
      query: 'Who painted the Mona Lisa and where is it kept?',
    });

    expect(results).toEqual([
      expect.objectContaining({
        url: 'https://en.wikipedia.org/wiki/Mona_Lisa',
        title: 'Mona Lisa - Wikipedia',
        snippet: expect.stringContaining('Leonardo da Vinci'),
      }),
    ]);
  });

  it('MAESTRO-CHAT · une question hors Joconde ne rend aucune source', async () => {
    await expect(client.search({ query: 'Joconde' })).resolves.toHaveLength(1);
    await expect(client.search({ query: 'Eiffel Tower height' })).resolves.toEqual([]);
  });
});
