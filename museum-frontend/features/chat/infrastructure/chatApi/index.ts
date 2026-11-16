import { postAudioMessage, synthesizeSpeech } from './audio';
import { getMessageImageUrl } from './image';
import {
  deleteSessionIfEmpty,
  getSession,
  listSessions,
  reportMessage,
  setMessageFeedback,
  setSessionContext,
} from './metadata';
import { createSession, postMessage, sendMessageSmart } from './send';

const sendMessageSmartBound = sendMessageSmart({ postMessage });

export const chatApi = {
  createSession,
  postMessage,
  postAudioMessage,
  synthesizeSpeech,
  getMessageImageUrl,
  getSession,
  deleteSessionIfEmpty,
  listSessions,
  reportMessage,
  setMessageFeedback,
  setSessionContext,
  sendMessageSmart: sendMessageSmartBound,
} as const;

export {
  postAudioMessage,
  synthesizeSpeech,
  getMessageImageUrl,
  deleteSessionIfEmpty,
  getSession,
  listSessions,
  reportMessage,
  setMessageFeedback,
  setSessionContext,
  createSession,
  postMessage,
};
export type { PostMessageParams, SendMessageSmartParams } from './send';
export type { PostAudioMessageParams } from './audio';
export type { SetSessionContextResult } from './metadata';
