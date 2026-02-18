import { httpRequest } from '@/services/http';
import { getErrorMessage } from '@/shared/lib/errors';
import { GuideLevel } from '@/features/settings/runtimeSettings';
import {
  CreateSessionRequestDTO,
  CreateSessionResponseDTO,
  GetSessionResponseDTO,
  ListSessionsRequestDTO,
  ListSessionsResponseDTO,
  PostMessageResponseDTO,
  isCreateSessionResponseDTO,
  isGetSessionResponseDTO,
  isListSessionsResponseDTO,
  isPostMessageResponseDTO,
} from '../domain/contracts';

const CHAT_BASE = '/api/chat';

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

export const chatApi = {
  async createSession(
    payload: CreateSessionRequestDTO,
  ): Promise<CreateSessionResponseDTO> {
    const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return ensureContract(data, isCreateSessionResponseDTO, 'create-session');
  },

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
        type: `image/${extension}`,
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

  async getSession(sessionId: string): Promise<GetSessionResponseDTO> {
    const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}?limit=50`, {
      method: 'GET',
    });

    return ensureContract(data, isGetSessionResponseDTO, 'get-session');
  },

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

    const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions${suffix}`, {
      method: 'GET',
    });

    return ensureContract(data, isListSessionsResponseDTO, 'list-sessions');
  },

  async createSessionOrThrow(payload: CreateSessionRequestDTO): Promise<CreateSessionResponseDTO> {
    try {
      return await this.createSession(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
