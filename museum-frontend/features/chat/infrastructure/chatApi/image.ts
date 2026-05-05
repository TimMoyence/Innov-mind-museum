import { openApiRequest } from '@/shared/api/openapiClient';
import type { components } from '@/shared/api/generated/openapi';

type SignedImageUrlResponseDTO = components['schemas']['SignedImageUrlResponse'];

/** Requests a signed URL for a message's attached image. */
export const getMessageImageUrl = async (
  messageId: string,
): Promise<SignedImageUrlResponseDTO> =>
  openApiRequest({
    path: '/api/chat/messages/{messageId}/image-url',
    method: 'post',
    pathParams: { messageId },
  });
