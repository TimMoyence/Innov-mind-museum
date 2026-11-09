export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

export interface ExtractedMessage {
  content: string | Array<TextPart | ImageUrlPart>;
  role: string;
}

export function makeInputArrayPayload(
  messages: ExtractedMessage[] = [{ role: 'user', content: 'default secret' }],
): { data: ExtractedMessage[] } {
  return { data: messages };
}

export function makeOutputObjectPayload(
  content: string | Array<TextPart | ImageUrlPart>,
  role = 'assistant',
): { data: ExtractedMessage } {
  return { data: { content, role } };
}

export function makeOutputStringPayload(text: string): { data: string } {
  return { data: text };
}

export function makeMultimodalUserMessage(
  text: string,
  imageUrl: string,
  role = 'user',
): ExtractedMessage {
  return {
    role,
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: imageUrl } },
    ],
  };
}
