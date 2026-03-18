import { ChatMessage } from '../domain/chatMessage.entity';

/**
 * Returns the most recent messages from the conversation history, sorted chronologically.
 * @param history - Full message history (may be unsorted).
 * @param maxMessages - Maximum number of messages to keep; returns empty array when <= 0.
 * @returns A chronologically sorted slice of the last `maxMessages` messages.
 */
export const applyHistoryWindow = (
  history: ChatMessage[],
  maxMessages: number,
): ChatMessage[] => {
  if (maxMessages <= 0) return [];

  const sorted = [...history].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  return sorted.slice(-maxMessages);
};
