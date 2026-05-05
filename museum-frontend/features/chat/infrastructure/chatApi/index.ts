/**
 * Chat API public surface — façade aggregating the five capability modules
 * (`send`, `stream`, `image`, `audio`, `metadata`) and the legacy `chatApi`
 * object the rest of the app consumes.
 *
 * Direct module imports are also fine when a caller only needs one
 * capability — e.g. `import { synthesizeSpeech } from '@/features/chat/infrastructure/chatApi/audio'`.
 *
 * Wired this way (façade + named exports) so that:
 *  - `import { chatApi } from '@/features/chat/infrastructure/chatApi'` keeps
 *    working unchanged for the 12+ existing consumers (backward-compat).
 *  - `sendMessageSmart` receives `postMessage` and `postMessageStream` as
 *    explicit dependencies, breaking the previous `this`-based coupling
 *    between sibling methods.
 */
import { postAudioMessage, synthesizeSpeech } from './audio';
import { getMessageImageUrl } from './image';
import {
  deleteSessionIfEmpty,
  getSession,
  listSessions,
  reportMessage,
  setMessageFeedback,
} from './metadata';
import { createSession, createSessionOrThrow, postMessage, sendMessageSmart } from './send';
import { postMessageStream } from './stream';

const sendMessageSmartBound = sendMessageSmart({ postMessage, postMessageStream });

/** Aggregator preserving the legacy `chatApi.method(...)` call sites. */
export const chatApi = {
  createSession,
  createSessionOrThrow,
  postMessage,
  postMessageStream,
  postAudioMessage,
  synthesizeSpeech,
  getMessageImageUrl,
  getSession,
  deleteSessionIfEmpty,
  listSessions,
  reportMessage,
  setMessageFeedback,
  sendMessageSmart: sendMessageSmartBound,
} as const;

// Capability re-exports for callers that prefer the granular surface.
export {
  postAudioMessage,
  synthesizeSpeech,
  getMessageImageUrl,
  deleteSessionIfEmpty,
  getSession,
  listSessions,
  reportMessage,
  setMessageFeedback,
  createSession,
  createSessionOrThrow,
  postMessage,
  postMessageStream,
};
export type { PostMessageParams, SendMessageSmartParams } from './send';
export type { PostMessageStreamParams } from './stream';
export type { PostAudioMessageParams } from './audio';
