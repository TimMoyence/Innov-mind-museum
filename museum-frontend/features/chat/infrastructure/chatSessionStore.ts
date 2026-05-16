import { create } from 'zustand';

import type { ChatUiMessage } from '../application/chatSessionLogic.pure';

/**
 * In-memory chat session cache.
 *
 * V1 decision (2026-05-14 mobile-infra-hardening batch, P0 #5):
 *   - `persist` middleware was DROPPED. The previous implementation
 *     serialised the full `sessions` map (messages + AI responses,
 *     containing user PII and contextual conversation) to plaintext
 *     AsyncStorage under the key `musaium.chatSessions`. That bypassed
 *     the TanStack `shouldDehydrateQuery` allowlist (which excludes the
 *     `messages` key prefix from the query persister) — i.e. messages
 *     were on disk in plaintext despite the protective allowlist.
 *     Threat model: rooted/jailbroken device extraction trivially
 *     yields multi-session chat history. OWASP MASVS-STORAGE
 *     non-compliant. Cf. audit-2026-05-12 R12 finding §2 + §8.
 *
 *   - In-memory only. Re-hydration on chat focus is handled by
 *     `useSessionLoader.ts:30` which calls `chatApi.getSession()` and
 *     writes via `storeSetSession`. Cold start cost: 200-400ms before
 *     messages appear (acceptable for online-first V1 per R12 §8.4).
 *
 *   - The eviction cap (`MAX_PERSISTED_SESSIONS`) is preserved as an
 *     in-memory bound to prevent unbounded growth during a single app
 *     session (rarely matters in practice; defensive).
 *
 * V1.1+ path: if offline chat history becomes a feature ask, re-key to
 * an encrypted persister (expo-secure-store-backed Zustand storage with
 * 2KB chunking, or encrypted MMKV with key in SecureStore). Do NOT
 * re-introduce `persist` against plaintext AsyncStorage.
 */

/** Persisted state for a single chat session. */
interface PersistedSession {
  messages: ChatUiMessage[];
  title: string | null;
  museumName: string | null;
  updatedAt: number;
}

/** Maximum number of sessions kept in the in-memory map. */
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
