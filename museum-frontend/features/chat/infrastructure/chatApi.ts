import { httpRequest } from '@/services/http';
import { openApiRequest } from '@/shared/api/openapiClient';
import { getErrorMessage } from '@/shared/lib/errors';
import type { components } from '@/shared/api/generated/openapi';
import { GuideLevel } from '@/features/settings/runtimeSettings';
import {
  CreateSessionRequestDTO,
  CreateSessionResponseDTO,
  DeleteSessionResponseDTO,
  GetSessionResponseDTO,
  ListSessionsRequestDTO,
  ListSessionsResponseDTO,
  PostMessageResponseDTO,
  ReportMessageResponseDTO,
  ReportReason,
  isCreateSessionResponseDTO,
  isDeleteSessionResponseDTO,
  isGetSessionResponseDTO,
  isListSessionsResponseDTO,
  isPostMessageResponseDTO,
  isReportMessageResponseDTO,
} from '../domain/contracts';

type SignedImageUrlResponseDTO = components['schemas']['SignedImageUrlResponse'];

const CHAT_BASE = '/api/chat';

const audioMimeByExtension: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

const normalizeImageMimeTypeFromExtension = (extensionRaw: string | undefined): string => {
  const extension = (extensionRaw || 'jpg').toLowerCase();
  if (extension === 'jpg') {
    return 'image/jpeg';
  }
  if (extension === 'jpeg') {
    return 'image/jpeg';
  }
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return `image/${extension}`;
};

const ensureContract = <T>(
  payload: unknown,
  validator: (value: unknown) => value is T,
  label: string,
): T => {
  if (!validator(payload)) {
    throw new Error(`Invalid ${label} contract`);
  }

  return payload;
};

/** Service for chat API operations: session CRUD, messaging (text/image/audio), and message reporting. */
export const chatApi = {
  /**
   * Creates a new chat session.
   * @param payload - Session creation parameters (locale, museum mode, etc.).
   * @returns The created session response, validated against the contract.
   */
  async createSession(
    payload: CreateSessionRequestDTO,
  ): Promise<CreateSessionResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions',
      method: 'post',
      body: JSON.stringify(payload),
    });

    return ensureContract(data, isCreateSessionResponseDTO, 'create-session');
  },

  /**
   * Posts a text or image message to a session and returns the assistant response.
   * Builds a multipart form when an image URI is provided.
   * @param params - Message payload including session ID, optional text, image URI, and context.
   * @returns The assistant's response, validated against the contract.
   */
  async postMessage(params: {
    sessionId: string;
    text?: string;
    imageUri?: string;
    museumMode?: boolean;
    location?: string;
    guideLevel?: GuideLevel;
    locale?: string;
  }): Promise<PostMessageResponseDTO> {
    const {
      sessionId,
      text,
      imageUri,
      museumMode,
      location,
      guideLevel,
      locale,
    } =
      params;

    let payload: unknown;

    if (imageUri) {
      const fileName = imageUri.split('/').pop() || 'image.jpg';
      const extension = fileName.includes('.')
        ? fileName.split('.').pop()
        : 'jpg';

      const formData = new FormData();
      if (text?.trim()) {
        formData.append('text', text.trim());
      }
      formData.append(
        'context',
        JSON.stringify({ museumMode, location, guideLevel, locale }),
      );
      formData.append('image', {
        uri: imageUri,
        name: fileName,
        type: normalizeImageMimeTypeFromExtension(extension),
      } as unknown as Blob);

      payload = formData;
    } else {
      payload = JSON.stringify({
        text: text?.trim() || undefined,
        context: {
          museumMode,
          location,
          guideLevel,
          locale,
        },
      });
    }

    const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: payload,
    });

    return ensureContract(data, isPostMessageResponseDTO, 'post-message');
  },

  /**
   * Posts an audio message for transcription and returns the assistant response.
   * Accepts either a local audio URI or a Blob.
   * @param params - Audio payload including session ID, audio source, and context.
   * @returns The assistant's response with optional transcription, validated against the contract.
   */
  async postAudioMessage(params: {
    sessionId: string;
    audioUri?: string;
    audioBlob?: Blob;
    museumMode?: boolean;
    location?: string;
    guideLevel?: GuideLevel;
    locale?: string;
  }): Promise<PostMessageResponseDTO> {
    const {
      sessionId,
      audioUri,
      audioBlob,
      museumMode,
      location,
      guideLevel,
      locale,
    } = params;

    if (!audioUri && !audioBlob) {
      throw new Error('audioUri or audioBlob is required');
    }

    const fallbackExt = audioBlob?.type.includes('webm') ? 'webm' : 'm4a';
    const fileName = (audioUri?.split('/').pop() || `voice-${Date.now()}.${fallbackExt}`).trim();
    const extension = fileName.includes('.')
      ? fileName.split('.').pop()?.toLowerCase() || fallbackExt
      : fallbackExt;
    const mimeType = audioBlob?.type || audioMimeByExtension[extension] || 'audio/mp4';

    const formData = new FormData();
    formData.append(
      'context',
      JSON.stringify({ museumMode, location, guideLevel, locale }),
    );
    if (audioBlob) {
      formData.append('audio', audioBlob, fileName);
    } else {
      formData.append('audio', {
        uri: audioUri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }

    const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}/audio`, {
      method: 'POST',
      body: formData,
    });

    return ensureContract(data, isPostMessageResponseDTO, 'post-audio-message');
  },

  /**
   * Fetches a session with its messages (up to 50 per page).
   * @param sessionId - ID of the session to retrieve.
   * @returns Session details and messages, validated against the contract.
   */
  async getSession(sessionId: string): Promise<GetSessionResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions/{id}',
      method: 'get',
      pathParams: { id: sessionId },
      query: { limit: 50 },
    });

    return ensureContract(data, isGetSessionResponseDTO, 'get-session');
  },

  /**
   * Deletes a session (typically only when it has no messages).
   * @param sessionId - ID of the session to delete.
   * @returns Deletion confirmation, validated against the contract.
   */
  async deleteSessionIfEmpty(sessionId: string): Promise<DeleteSessionResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions/{id}',
      method: 'delete',
      pathParams: { id: sessionId },
    });

    return ensureContract(data, isDeleteSessionResponseDTO, 'delete-session');
  },

  /**
   * Requests a signed URL for a message's attached image.
   * @param messageId - ID of the message whose image URL is needed.
   * @returns A signed URL response with expiration metadata.
   */
  async getMessageImageUrl(messageId: string): Promise<SignedImageUrlResponseDTO> {
    return openApiRequest({
      path: '/api/chat/messages/{messageId}/image-url',
      method: 'post',
      pathParams: { messageId },
    });
  },

  /**
   * Lists chat sessions with cursor-based pagination.
   * @param params - Optional cursor and limit for pagination.
   * @returns Paginated session list, validated against the contract.
   */
  async listSessions(
    params: ListSessionsRequestDTO = {},
  ): Promise<ListSessionsResponseDTO> {
    const query = new URLSearchParams();
    if (params.cursor) {
      query.set('cursor', params.cursor);
    }
    if (params.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';

    const data = await openApiRequest({
      path: '/api/chat/sessions',
      method: 'get',
      query: {
        cursor: params.cursor,
        limit: params.limit,
      },
    });

    return ensureContract(data, isListSessionsResponseDTO, 'list-sessions');
  },

  /**
   * Reports a message for moderation.
   * @param params - Message ID, report reason, and optional comment.
   * @returns Report confirmation, validated against the contract.
   */
  async reportMessage(params: {
    messageId: string;
    reason: ReportReason;
    comment?: string;
  }): Promise<ReportMessageResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/messages/{messageId}/report',
      method: 'post',
      pathParams: { messageId: params.messageId },
      body: JSON.stringify({
        reason: params.reason,
        comment: params.comment,
      }),
    });

    return ensureContract(data, isReportMessageResponseDTO, 'report-message');
  },

  /**
   * Creates a session, re-throwing any error as a plain `Error` with a user-facing message.
   * @param payload - Session creation parameters.
   * @returns The created session response.
   * @throws A plain `Error` wrapping the user-facing error message.
   */
  async createSessionOrThrow(payload: CreateSessionRequestDTO): Promise<CreateSessionResponseDTO> {
    try {
      return await this.createSession(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
