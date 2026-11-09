interface PhaseTelemetryContext {
  readonly sessionId: string;
  readonly messageId: string;
}

export function logPhaseTelemetry(metadata: unknown, ctx: PhaseTelemetryContext): void {
  if (!metadata || typeof metadata !== 'object') return;
  const phase = (metadata as { phase?: unknown }).phase;
  if (typeof phase !== 'string' || phase.length === 0) return;
  console.debug('[chat.phase]', phase, {
    sessionId: ctx.sessionId,
    messageId: ctx.messageId,
  });
}
