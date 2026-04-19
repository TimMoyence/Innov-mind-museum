/**
 * Pure decision logic for picking a `sendMessage` strategy in `useChatSession`.
 * No React, no side effects, fully unit-testable.
 */

export interface SendAttempt {
  text?: string;
  imageUri?: string;
  audioUri?: string;
  audioBlob?: Blob;
}

export interface StrategyContext {
  isLowData: boolean;
  isOffline: boolean;
  isConnected: boolean;
  museumName: string | null;
  isFirstTurn: boolean;
}

export type StrategyKind = 'cache' | 'offline' | 'audio' | 'streaming';

/** Returns true when the attempt contains any sendable content (trimmed text or media). */
export const hasContent = (attempt: SendAttempt): boolean => {
  if (attempt.text?.trim()) return true;
  if (attempt.imageUri) return true;
  if (attempt.audioUri) return true;
  if (attempt.audioBlob) return true;
  return false;
};

/**
 * Picks the right strategy for an attempt + runtime context.
 *
 * Priority order:
 * 1. `cache`     — low-data + museum-initiated + first-turn text-only (cache-first, may fall through to streaming on miss)
 * 2. `offline`   — offline queue when connectivity is down
 * 3. `audio`     — direct non-streaming path when audio payload is attached
 * 4. `streaming` — default SSE text/image path
 *
 * Returns `null` when the attempt has no sendable content.
 */
export const pickSendStrategy = (
  attempt: SendAttempt,
  context: StrategyContext,
): StrategyKind | null => {
  if (!hasContent(attempt)) return null;

  const trimmedText = attempt.text?.trim();

  if (
    context.isLowData &&
    context.museumName &&
    trimmedText &&
    !attempt.imageUri &&
    context.isFirstTurn
  ) {
    return 'cache';
  }

  if (context.isOffline) {
    return 'offline';
  }

  if (attempt.audioUri || attempt.audioBlob) {
    return 'audio';
  }

  return 'streaming';
};
