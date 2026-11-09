import type { ReviewStatus } from '@modules/review/domain/review/review.types';

export interface ReviewModerationPayload {
  recipientEmail: string;
  recipientName: string;
  reviewId: string;
  rating: number;
  comment: string;
  afterStatus: ReviewStatus;
  locale: 'fr' | 'en';
}

export interface ReviewModerationNotifier {
  notify(payload: ReviewModerationPayload): Promise<void>;
}
