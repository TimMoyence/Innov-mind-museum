import { httpRequest } from '@/shared/api/httpRequest';

interface DescribeImageInput {
  base64: string;
  mimeType?: string;
}

interface DescribeInput {
  image?: DescribeImageInput;
  text?: string;
  locale: string;
  guideLevel: string;
  format: 'text' | 'audio' | 'both';
}

interface DescribeResult {
  description: string;
  audio?: string; // base64 MP3
  metadata: Record<string, unknown>;
}

/** Requests an AI-generated artwork description, optionally with audio narration. */
export async function describeArtwork(input: DescribeInput): Promise<DescribeResult> {
  const body = {
    ...input,
    image: input.image
      ? { source: 'base64' as const, value: input.image.base64, mimeType: input.image.mimeType }
      : undefined,
  };
  return httpRequest<DescribeResult>('/api/chat/describe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
