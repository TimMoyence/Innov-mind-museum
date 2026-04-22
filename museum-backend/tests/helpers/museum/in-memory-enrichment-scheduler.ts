import type { EnrichmentSchedulerPort } from '@modules/museum/domain/ports/enrichment-scheduler.port';
import type { RefreshStaleEnrichmentsUseCase } from '@modules/museum/useCase/refreshStaleEnrichments.useCase';

/**
 * In-memory stub for {@link EnrichmentSchedulerPort}.
 *
 * No timers, no BullMQ — tests drive the scheduler by calling {@link tick}
 * directly, which is deterministic and avoids leaking open handles from the
 * Jest process.
 */
export class InMemoryEnrichmentScheduler implements EnrichmentSchedulerPort {
  private started = false;
  private readonly ticks: Awaited<ReturnType<RefreshStaleEnrichmentsUseCase['execute']>>[] = [];

  constructor(private readonly useCase: RefreshStaleEnrichmentsUseCase) {}

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  /**
   * Test helper — run one scan pass synchronously, recording the result.
   * @param now
   */
  async tick(now?: Date): Promise<void> {
    if (!this.started) throw new Error('scheduler not started');
    const result = await this.useCase.execute(now);
    this.ticks.push(result);
  }

  /** Test helper — inspect recorded tick results. */
  snapshot(): readonly Awaited<ReturnType<RefreshStaleEnrichmentsUseCase['execute']>>[] {
    return [...this.ticks];
  }

  /** Test helper — current lifecycle flag. */
  isRunning(): boolean {
    return this.started;
  }
}
