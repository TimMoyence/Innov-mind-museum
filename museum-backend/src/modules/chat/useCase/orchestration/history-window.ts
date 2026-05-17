import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

/** Rough token estimate: ~4 chars per token (English average). */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

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
