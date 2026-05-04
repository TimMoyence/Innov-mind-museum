import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

/** Rough token estimate: ~4 chars per token (English average). */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * Returns the most recent messages from the conversation history, sorted chronologically.
 * Applies both a message count limit and an optional token budget.
 *
 * @param history - Full message history (may be unsorted).
 * @param maxMessages - Maximum number of messages to keep; returns empty array when <= 0.
 * @param maxTokens - Optional token budget; when set, trims oldest messages to fit.
 * @returns A chronologically sorted slice of the most recent messages within both limits.
 */
export const applyHistoryWindow = (
  history: ChatMessage[],
  maxMessages: number,
  maxTokens?: number,
): ChatMessage[] => {
  if (maxMessages <= 0) return [];

  const sorted = [...history].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  let trimmed = sorted.slice(-maxMessages);

  if (maxTokens && maxTokens > 0) {
    let totalTokens = 0;
    const withinBudget: ChatMessage[] = [];
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(trimmed[i].text ?? '');
      if (totalTokens + msgTokens > maxTokens) break;
      totalTokens += msgTokens;
      withinBudget.unshift(trimmed[i]);
    }
    trimmed = withinBudget;
  }

  return trimmed;
};
