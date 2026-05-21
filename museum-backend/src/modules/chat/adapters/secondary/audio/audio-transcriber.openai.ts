import { AppError, badRequest } from '@shared/errors/app.error';
import { extensionByMime } from '@shared/media/mime-extensions';
import {
  ChatPhaseTimer,
  type ChatPhaseErrorType,
  type ChatPhaseOutcome,
} from '@shared/observability/chat-phase-timer';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import type {
  AudioTranscriberInput,
  AudioTranscriptionResult,
  AudioTranscriber,
} from '@modules/chat/domain/ports/audio-transcriber.port';
import type { LangfuseGenerationClient } from 'langfuse';

const toLanguageHint = (locale?: string): string | undefined => {
  const candidate = locale?.trim();
  if (!candidate) {
    return undefined;
  }

  const normalized = candidate.split('-')[0]?.toLowerCase();
  return normalized && normalized.length <= 8 ? normalized : undefined;
};

const toAudioFileName = (mimeType: string): string => {
  const extension = extensionByMime[mimeType] || 'm4a';
  return `voice-input.${extension}`;
};

interface OpenAiTranscriptionPayload {
  text?: unknown;
  error?: {
    message?: unknown;
  };
}

const assertOpenAiAvailable = (): void => {
  if (env.llm.provider !== 'openai' || !env.llm.openAiApiKey) {
    throw new AppError({
      message: 'Audio transcription is currently available only when LLM provider is OpenAI.',
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  }
};

/** @throws {Error} 400 on empty/invalid input. */
const decodeAudioPayload = (base64: string): Buffer => {
  const normalizedBase64 = base64.trim();
  if (!normalizedBase64) {
    throw badRequest('Audio payload is empty');
  }

  const audioBuffer = Buffer.from(normalizedBase64, 'base64');
  if (!audioBuffer.byteLength) {
    throw badRequest('Audio payload is invalid');
  }
  return audioBuffer;
};

const buildTranscriptionFormData = (
  input: AudioTranscriberInput,
  audioBuffer: Buffer,
): FormData => {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: input.mimeType }),
    toAudioFileName(input.mimeType),
  );
  formData.append('model', env.llm.audioTranscriptionModel);

  const languageHint = toLanguageHint(input.locale);
  if (languageHint) {
    formData.append('language', languageHint);
  }
  // W7.4 (2026-05-17) — bias toward expected proper nouns. Hard-capped at
  // 896 chars (~224 OpenAI tokens) defensively even if the caller already
  // truncated.
  if (input.prompt) {
    const capped = input.prompt.length > 896 ? input.prompt.slice(0, 896).trimEnd() : input.prompt;
    if (capped) {
      formData.append('prompt', capped);
    }
  }
  return formData;
};

/** Wraps timeout/abort → AppError(504). */
const fetchTranscription = async (formData: FormData): Promise<Response> => {
  try {
    return await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.llm.openAiApiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(env.llm.timeoutMs),
    });
  } catch (error: unknown) {
    if (
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new AppError({
        message: 'Audio transcription request timed out',
        statusCode: 504,
        code: 'UPSTREAM_TIMEOUT',
      });
    }
    throw error;
  }
};

const parseTranscriptionResponse = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as OpenAiTranscriptionPayload | null;

  if (!response.ok) {
    const upstreamMessage =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'Audio transcription request failed';

    throw new AppError({
      message: upstreamMessage,
      statusCode: 502,
      code: 'UPSTREAM_AUDIO_TRANSCRIPTION_ERROR',
    });
  }

  if (typeof payload?.text !== 'string' || !payload.text.trim()) {
    throw new AppError({
      message: 'Audio transcription returned an empty result',
      statusCode: 502,
      code: 'UPSTREAM_AUDIO_TRANSCRIPTION_INVALID',
    });
  }

  return payload.text.trim();
};

/**
 * Default `gpt-4o-mini-transcribe` (env.llm.audioTranscriptionModel).
 * Reuses shared `OPENAI_API_KEY`.
 */
export class OpenAiAudioTranscriber implements AudioTranscriber {
  /** @throws {Error} AppError FEATURE_UNAVAILABLE | UPSTREAM_AUDIO_TRANSCRIPTION_ERROR */
  async transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult> {
    const requestId = input.requestId ?? 'unknown';
    const timer = ChatPhaseTimer.start('stt', 'openai', requestId, {
      model: env.llm.audioTranscriptionModel,
      metadata: { mimeType: input.mimeType, locale: input.locale },
    });
    let outcome: ChatPhaseOutcome = 'success';
    let errorType: ChatPhaseErrorType = 'unknown';
    let generation: LangfuseGenerationClient | undefined;
    try {
      return await startSpan(
        {
          name: 'audio.transcribe',
          op: 'ai.transcribe',
          attributes: {
            'audio.mime_type': input.mimeType,
            'audio.model': env.llm.audioTranscriptionModel,
          },
        },
        async () => {
          assertOpenAiAvailable();
          const audioBuffer = decodeAudioPayload(input.base64);
          // TD-20 (R3/R6/D-Q1) — STT cost generation. Billed per audio SECOND,
          // but the adapter has no duration source, so emit `BYTES` +
          // `metadata.durationKnown:false` (no new media-decode dep — KISS,
          // PATTERNS.md §9.3 P4 / LESSONS LF-V3-12). Scope spread-omit (never
          // fabricated). PII: only byteLength + mimeType, never base64/text.
          generation = openSttGeneration(audioBuffer.byteLength, requestId, input);
          const formData = buildTranscriptionFormData(input, audioBuffer);
          const response = await fetchTranscription(formData);
          const text = await parseTranscriptionResponse(response);

          safeTrace('langfuse.stt.generation.end', () => generation?.end({}));
          return {
            text,
            model: env.llm.audioTranscriptionModel,
            provider: 'openai',
          };
        },
      );
    } catch (err) {
      outcome = 'error';
      errorType = classifySttError(err);
      safeTrace('langfuse.stt.generation.end.error', () =>
        generation?.end({
          level: 'ERROR',
          statusMessage: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    } finally {
      timer.end(outcome, errorType);
    }
  }
}

/**
 * TD-20 — opens the STT Langfuse `generation` (PATTERNS.md §2.3 chain + §9.3 P4;
 * fail-open `safeTrace`+`getLangfuse()`). `BYTES` interim unit per D-Q1.
 * Returns `undefined` when Langfuse is disabled.
 */
const openSttGeneration = (
  byteLength: number,
  requestId: string,
  input: AudioTranscriberInput,
): LangfuseGenerationClient | undefined => {
  const scope = {
    ...(input.museumId !== undefined ? { museumId: input.museumId } : {}),
    ...(input.tier !== undefined ? { tier: input.tier } : {}),
  };
  return safeTrace('langfuse.stt.generation.create', () => {
    const lf = getLangfuse();
    return lf
      ?.trace({
        name: 'stt.transcribe',
        metadata: { requestId, ...scope },
      })
      .generation({
        name: 'stt.transcribe.generation',
        model: env.llm.audioTranscriptionModel,
        // v3.38.20 — `unit` lives INSIDE `usage` (PATTERNS.md §2.5). `BYTES` is
        // not a valid `ModelUsageUnit`; per D-Q1 we flag the interim via
        // `metadata.durationKnown:false` and carry the byte count.
        usage: { input: byteLength },
        usageDetails: { input: byteLength },
        metadata: {
          durationKnown: false,
          unit: 'BYTES',
          mimeType: input.mimeType,
          ...scope,
        },
      });
  });
};

function classifySttError(err: unknown): ChatPhaseErrorType {
  if (err instanceof AppError) {
    if (err.code === 'UPSTREAM_TIMEOUT') return 'timeout';
    if (
      err.code === 'UPSTREAM_AUDIO_TRANSCRIPTION_ERROR' ||
      err.code === 'UPSTREAM_AUDIO_TRANSCRIPTION_INVALID'
    ) {
      return 'upstream_5xx';
    }
  }
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return err.name === 'TimeoutError' ? 'timeout' : 'abort';
  }
  return 'unknown';
}
