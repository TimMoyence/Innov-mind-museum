import { performance } from 'perf_hooks';

import { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

const wait = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockLatencyOrchestrator implements ChatOrchestrator {
  constructor(
    private readonly minDelayMs: number,
    private readonly maxDelayMs: number,
  ) {}

  async generate(): Promise<OrchestratorOutput> {
    const delayMs =
      this.minDelayMs + Math.floor(Math.random() * Math.max(1, this.maxDelayMs - this.minDelayMs));
    await wait(delayMs);

    return {
      text: 'Synthetic response for perf profiling.',
      metadata: {},
    };
  }

  async generateStream(
    _input: unknown,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    const result = await this.generate();
    onChunk(result.text);
    return result;
  }
}

const p95 = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index];
};

const run = async (): Promise<void> => {
  const requests = Number(process.env.PERF_REQUESTS || 40);
  const concurrency = Number(process.env.PERF_CONCURRENCY || 8);
  const minDelayMs = Number(process.env.PERF_MIN_DELAY_MS || 120);
  const maxDelayMs = Number(process.env.PERF_MAX_DELAY_MS || 450);
  const budgetMs = Number(process.env.PERF_P95_BUDGET_MS || 25000);

  const service: ChatService = buildChatTestService(
    new MockLatencyOrchestrator(minDelayMs, maxDelayMs),
  );
  const session = await service.createSession({
    locale: 'en-US',
    museumMode: true,
    userId: 999,
  });

  const timings: number[] = [];
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= requests) break;

      const startedAt = performance.now();
      await service.postMessage(session.id, {
        text: `Perf message ${index + 1}`,
        context: { museumMode: true },
      });
      timings.push(performance.now() - startedAt);
    }
  });

  await Promise.all(workers);

  const result = {
    requests,
    concurrency: Math.max(1, concurrency),
    minMs: Math.min(...timings),
    avgMs: timings.reduce((sum, current) => sum + current, 0) / Math.max(1, timings.length),
    p95Ms: p95(timings),
    maxMs: Math.max(...timings),
    budgetMs,
    passed: p95(timings) <= budgetMs,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exitCode = 1;
  }
};

void run();
