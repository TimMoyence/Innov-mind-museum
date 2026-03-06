import { ChatMessage } from '../domain/chatMessage.entity';

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
