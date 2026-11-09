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

export const hasContent = (attempt: SendAttempt): boolean => {
  if (attempt.text?.trim()) return true;
  if (attempt.imageUri) return true;
  if (attempt.audioUri) return true;
  if (attempt.audioBlob) return true;
  return false;
};

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
