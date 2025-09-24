import { httpRequest } from './http';
import { IA_ENDPOINTS, buildApiUrl } from './apiConfig';

export interface AnalyzeImageResponse {
  conversationId?: string;
  insight?: string;
  [key: string]: unknown;
}

export interface AskMuseumQuestionResponse {
  conversationId?: string;
  response?: string;
  error?: boolean;
  message?: string;
  [key: string]: unknown;
}

const extractFileExtension = (uri: string, fallback = 'jpg'): string => {
  const parts = uri.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : fallback;
};

export const iaService = {
  async analyzeImage(
    imageUri: string,
    conversationId?: string,
  ): Promise<AnalyzeImageResponse> {
    if (!imageUri) {
      throw new Error("Image URI is required for analyzeImage");
    }

    const formData = new FormData();
    const fileExtension = extractFileExtension(imageUri);

    formData.append('image', {
      uri: imageUri,
      name: `photo.${fileExtension}`,
      type: `image/${fileExtension}`,
    } as any);

    if (conversationId) {
      formData.append('conversationId', conversationId);
    }

    const response = await httpRequest<AnalyzeImageResponse | string>(
      buildApiUrl(IA_ENDPOINTS.imageInsight),
      {
        method: 'POST',
        body: formData,
      },
    );

    if (typeof response === 'string') {
      try {
        return JSON.parse(response) as AnalyzeImageResponse;
      } catch (_error) {
        return { insight: response };
      }
    }

    return response;
  },

  async askMuseumQuestion(
    question: string,
    artworkImageUri?: string,
    conversationId?: string,
  ): Promise<AskMuseumQuestionResponse> {
    if (!question.trim()) {
      throw new Error('La question ne peut pas être vide');
    }

    const basePayload = {
      artName: 'Non spécifié',
      artist: 'Non spécifié',
      responseTo: question,
    };

    if (artworkImageUri) {
      const formData = new FormData();
      const fileExtension = extractFileExtension(artworkImageUri);

      formData.append('artName', basePayload.artName);
      formData.append('artist', basePayload.artist);
      formData.append('responseTo', basePayload.responseTo);

      formData.append('artworkImage', {
        uri: artworkImageUri,
        name: `artwork.${fileExtension}`,
        type: `image/${fileExtension}`,
      } as any);

      if (conversationId) {
        formData.append('conversationId', conversationId);
      }

      const response = await httpRequest<AskMuseumQuestionResponse | string>(
        buildApiUrl(IA_ENDPOINTS.museum),
        {
          method: 'POST',
          body: formData,
        },
      );

      if (typeof response === 'string') {
        try {
          return JSON.parse(response) as AskMuseumQuestionResponse;
        } catch (_error) {
          return { response };
        }
      }

      return response;
    }

    const response = await httpRequest<AskMuseumQuestionResponse>(
      buildApiUrl(IA_ENDPOINTS.museum),
      {
        method: 'POST',
        body: JSON.stringify({
          ...basePayload,
          conversationId,
        }),
      },
    );

    return response;
  },
};

export type IAService = typeof iaService;
