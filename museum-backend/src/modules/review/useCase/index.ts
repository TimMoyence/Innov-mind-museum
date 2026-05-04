/**
 * Review module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { AppDataSource } from '@data/db/data-source';
import { userRepository } from '@modules/auth/useCase';
import {
  EmailReviewModerationNotifier,
  NoopReviewModerationNotifier,
} from '@modules/review/adapters/secondary/notifier/review-moderation-email.notifier';
import { ReviewRepositoryPg } from '@modules/review/adapters/secondary/pg/review.repository.pg';
import { ListAllReviewsUseCase } from '@modules/review/useCase/admin/listAllReviews.useCase';
import { ModerateReviewUseCase } from '@modules/review/useCase/moderation/moderateReview.useCase';
import { CreateReviewUseCase } from '@modules/review/useCase/public/createReview.useCase';
import { GetReviewStatsUseCase } from '@modules/review/useCase/public/getReviewStats.useCase';
import { ListApprovedReviewsUseCase } from '@modules/review/useCase/public/listApprovedReviews.useCase';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';

import type { ReviewAuthorLookup } from '@modules/review/useCase/moderation/moderateReview.useCase';

const reviewRepository = new ReviewRepositoryPg(AppDataSource);
const reviewModerationNotifier = env.brevoApiKey
  ? new EmailReviewModerationNotifier(new BrevoEmailService(env.brevoApiKey))
  : new NoopReviewModerationNotifier();

const authorLookup: ReviewAuthorLookup = async (userId) => {
  const user = await userRepository.getUserById(userId);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname,
    notifyOnReviewModeration: user.notifyOnReviewModeration,
  };
};

export const createReviewUseCase = new CreateReviewUseCase(reviewRepository);
export const listApprovedReviewsUseCase = new ListApprovedReviewsUseCase(reviewRepository);
export const listAllReviewsUseCase = new ListAllReviewsUseCase(reviewRepository);
export const moderateReviewUseCase = new ModerateReviewUseCase(reviewRepository, {
  notifier: reviewModerationNotifier,
  authorLookup,
});
export const getReviewStatsUseCase = new GetReviewStatsUseCase(reviewRepository);
