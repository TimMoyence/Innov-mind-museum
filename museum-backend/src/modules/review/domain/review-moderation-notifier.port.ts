import type { ReviewStatus } from './review.types';

/** Payload delivered to the notifier when a review is moderated. */
export interface ReviewModerationPayload {
  recipientEmail: string;
  recipientName: string;
  reviewId: string;
  rating: number;
  comment: string;
  afterStatus: ReviewStatus;
  locale: 'fr' | 'en';
}

/** Port: notifies the review author when their review is approved or rejected. */
export interface ReviewModerationNotifier {
  /** Deliver a notification to the review author. Idempotency/retry is up to the adapter. */
  notify(payload: ReviewModerationPayload): Promise<void>;
}
