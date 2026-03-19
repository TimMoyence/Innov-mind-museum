/** Discriminated union of all SSE event types emitted by the streaming chat endpoint. */
export type SseStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'guardrail'; text: string; reason: string }
  | { type: 'done'; messageId: string; createdAt: string; metadata: Record<string, unknown> }
  | { type: 'error'; code: string; message: string };

/**
 * Parses a raw SSE text buffer into structured events.
 * Returns parsed events and any remaining incomplete data.
 * @param buffer - Raw text from a `text/event-stream` response.
 * @returns Parsed events and the unprocessed remainder of the buffer.
 */
export function parseSseChunk(buffer: string): { events: SseStreamEvent[]; remainder: string } {
  const events: SseStreamEvent[] = [];
  const blocks = buffer.split('\n\n');
  // Last block may be incomplete — keep it as remainder
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventType = '';
    let dataLine = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice(6);
      }
    }

    if (!eventType || !dataLine) continue;

    try {
      const data = JSON.parse(dataLine) as Record<string, unknown>;

      switch (eventType) {
        case 'token':
          if (typeof data.t === 'string') {
            events.push({ type: 'token', text: data.t });
          }
          break;
        case 'guardrail':
          if (typeof data.text === 'string' && typeof data.reason === 'string') {
            events.push({ type: 'guardrail', text: data.text, reason: data.reason });
          }
          break;
        case 'done':
          if (typeof data.messageId === 'string' && typeof data.createdAt === 'string') {
            events.push({
              type: 'done',
              messageId: data.messageId,
              createdAt: data.createdAt,
              metadata: (data.metadata as Record<string, unknown>) ?? {},
            });
          }
          break;
        case 'error':
          if (typeof data.code === 'string' && typeof data.message === 'string') {
            events.push({ type: 'error', code: data.code, message: data.message });
          }
          break;
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  return { events, remainder };
}
