import type { Response } from 'express';

/** Initializes an SSE response with appropriate headers and flushes them immediately. */
export const initSseResponse = (res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
};

/** Guards against writing to a finished or destroyed response stream. */
const isWritable = (res: Response): boolean => {
  return !res.writableEnded && !res.destroyed;
};

/** Writes a single SSE event to the response stream. */
export const sendSseEvent = (res: Response, event: string, data: unknown): void => {
  if (!isWritable(res)) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\ndata: ${payload}\n\n`);
};

/** Sends a token SSE event containing a text chunk. */
export const sendSseToken = (res: Response, text: string): void => {
  sendSseEvent(res, 'token', { t: text });
};

/** Sends the done SSE event with message metadata, signaling the client to commit. */
export const sendSseDone = (
  res: Response,
  payload: { messageId: string; createdAt: string; metadata: Record<string, unknown> },
): void => {
  sendSseEvent(res, 'done', payload);
};

/** Sends an error SSE event. */
export const sendSseError = (res: Response, code: string, message: string): void => {
  sendSseEvent(res, 'error', { code, message });
};

/** Sends a guardrail SSE event when the output guardrail blocks mid-stream. */
export const sendSseGuardrail = (res: Response, text: string, reason: string): void => {
  sendSseEvent(res, 'guardrail', { text, reason });
};
