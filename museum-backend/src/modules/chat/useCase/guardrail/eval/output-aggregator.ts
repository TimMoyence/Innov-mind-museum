import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

export function aggregateOutputText(text: string, metadata: ChatAssistantMetadata): string {
  const parts: string[] = [text];
  for (const img of metadata.images ?? []) {
    if (img.caption) parts.push(img.caption);
    if (img.rationale) parts.push(img.rationale);
  }
  for (const sugg of metadata.suggestedImages ?? []) {
    if (sugg.caption) parts.push(sugg.caption);
    if (sugg.rationale) parts.push(sugg.rationale);
  }
  return parts.join(' ');
}
