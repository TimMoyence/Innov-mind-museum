import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { z } from 'zod';

export interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: {
    cache_read?: number;
    audio?: number;
  };
  output_token_details?: {
    audio?: number;
    reasoning?: number;
  };
}

export interface ChatModel {
  invoke(messages: unknown, options?: { signal?: AbortSignal }): Promise<{ content: unknown }>;
  stream(
    messages: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<{ content: unknown }>>;
  withStructuredOutput?<T>(
    schema: z.ZodType<T>,
    opts?: { name?: string; includeRaw?: boolean; strict?: boolean },
  ): {
    invoke(
      messages: unknown,
      opts?: { signal?: AbortSignal; callbacks?: BaseCallbackHandler[] },
    ): Promise<T | { raw: { usage_metadata?: UsageMetadata }; parsed: T | null }>;
  };
}
