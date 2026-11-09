import type { EnrichmentSchedulerPort } from '@modules/museum/domain/ports/enrichment-scheduler.port';
import type { RefreshStaleEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/refreshStaleEnrichments.useCase';

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

  async tick(now?: Date): Promise<void> {
    if (!this.started) throw new Error('scheduler not started');
    const result = await this.useCase.execute(now);
    this.ticks.push(result);
  }

  snapshot(): readonly Awaited<ReturnType<RefreshStaleEnrichmentsUseCase['execute']>>[] {
    return [...this.ticks];
  }

  isRunning(): boolean {
    return this.started;
  }
}
