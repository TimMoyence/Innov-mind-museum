import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { initOpenTelemetry, shutdownOpenTelemetry } from '@shared/observability/opentelemetry';

const COMPLETION = {
  id: 'chatcmpl-probe',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify({ answer: 'probe-ok' }), refusal: null },
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const report = (result: { ok: boolean; answer?: string; error?: string }): void => {
  process.stdout.write(`PROBE_RESULT ${JSON.stringify(result)}\n`);
};

async function main(): Promise<void> {
  initOpenTelemetry();

  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(COMPLETION));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const { ChatOpenAI } = await import('@langchain/openai');
  const { z } = await import('zod');

  const model = new ChatOpenAI({
    apiKey: 'probe-key',
    model: 'gpt-4o-mini',
    maxRetries: 0,
    configuration: { baseURL: `http://127.0.0.1:${port}/v1` },
  });

  try {
    const structured = model.withStructuredOutput(z.object({ answer: z.string() }), { name: 'probe' });
    const output = await structured.invoke('probe');
    report({ ok: true, answer: output.answer });
  } catch (error) {
    report({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    server.close();
    await shutdownOpenTelemetry();
  }
}

void main();
