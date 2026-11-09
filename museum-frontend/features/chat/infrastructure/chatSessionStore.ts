import { create } from 'zustand';

import type { ChatUiMessage } from '../application/chatSessionLogic.pure';

interface PersistedSession {
  messages: ChatUiMessage[];
  title: string | null;
  museumName: string | null;
  updatedAt: number;
}

const MAX_PERSISTED_SESSIONS = 10;

interface ChatSessionState {
  sessions: Record<string, PersistedSession>;
  setSession: (
    sessionId: string,
    messages: ChatUiMessage[],
    title: string | null,
    museumName: string | null,
  ) => void;
  updateMessages: (sessionId: string, messages: ChatUiMessage[]) => void;
  appendMessage: (sessionId: string, message: ChatUiMessage) => void;
  clearSession: (sessionId: string) => void;
}

const evictOldSessions = (
  sessions: Record<string, PersistedSession>,
): Record<string, PersistedSession> => {
  const entries = Object.entries(sessions);
  if (entries.length <= MAX_PERSISTED_SESSIONS) return sessions;

  const sorted = entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  return Object.fromEntries(sorted.slice(0, MAX_PERSISTED_SESSIONS));
};

export const useChatSessionStore = create<ChatSessionState>()((set) => ({
  sessions: {},

  setSession: (sessionId, messages, title, museumName) => {
    set((state) => ({
      sessions: evictOldSessions({
        ...state.sessions,
        [sessionId]: { messages, title, museumName, updatedAt: Date.now() },
      }),
    }));
  },

  updateMessages: (sessionId, messages) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...existing, messages, updatedAt: Date.now() },
        },
      };
    });
  },

  appendMessage: (sessionId, message) => {
    set((state) => {
      const existing = state.sessions[sessionId];
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
    });
  },

  clearSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
  },
}));
