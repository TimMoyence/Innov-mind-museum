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
  /** Idempotency/retry is up to the adapter. */
  notify(payload: ReviewModerationPayload): Promise<void>;
}
