import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { ChatUiMessage } from '../application/chatSessionLogic.pure';

/** Persisted state for a single chat session. */
interface PersistedSession {
  messages: ChatUiMessage[];
  title: string | null;
  museumName: string | null;
  updatedAt: number;
}

/** Maximum number of sessions kept in persistent storage. */
const MAX_PERSISTED_SESSIONS = 10;

interface ChatSessionState {
  /** Sessions keyed by sessionId. */
  sessions: Record<string, PersistedSession>;
  /** Set or replace the full session data (messages + metadata). */
  setSession: (
    sessionId: string,
    messages: ChatUiMessage[],
    title: string | null,
    museumName: string | null,
  ) => void;
  /** Replace the messages array for a session (preserves title/museumName). */
  updateMessages: (sessionId: string, messages: ChatUiMessage[]) => void;
  /** Append a single message to a session. */
  appendMessage: (sessionId: string, message: ChatUiMessage) => void;
  /** Remove a session from the store. */
  clearSession: (sessionId: string) => void;
}

/**
 * Evicts the oldest sessions when the store exceeds the session cap.
 * Returns a new sessions record trimmed to MAX_PERSISTED_SESSIONS.
 */
const evictOldSessions = (
  sessions: Record<string, PersistedSession>,
): Record<string, PersistedSession> => {
  const entries = Object.entries(sessions);
  if (entries.length <= MAX_PERSISTED_SESSIONS) return sessions;

  const sorted = entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  return Object.fromEntries(sorted.slice(0, MAX_PERSISTED_SESSIONS));
};

export const useChatSessionStore = create<ChatSessionState>()(
  persist(
    (set) => ({
      sessions: {},

      setSession: (sessionId, messages, title, museumName) =>
        set((state) => ({
          sessions: evictOldSessions({
            ...state.sessions,
            [sessionId]: { messages, title, museumName, updatedAt: Date.now() },
          }),
        })),

      updateMessages: (sessionId, messages) =>
        set((state) => {
          const existing = state.sessions[sessionId];
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive store guard
          if (!existing) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, messages, updatedAt: Date.now() },
            },
          };
        }),

      appendMessage: (sessionId, message) =>
        set((state) => {
          const existing = state.sessions[sessionId];
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive store guard
          if (!existing) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: [...existing.messages, message],
                updatedAt: Date.now(),
              },
            },
          };
        }),

      clearSession: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.sessions;
          return { sessions: rest };
        }),
    }),
    {
      name: 'musaium.chatSessions',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
