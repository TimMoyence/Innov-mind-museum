/**
 * Review module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { UserRepositoryPg } from '@modules/auth/adapters/secondary/user.repository.pg';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';

import { CreateReviewUseCase } from './createReview.useCase';
import { GetReviewStatsUseCase } from './getReviewStats.useCase';
import { ListAllReviewsUseCase } from './listAllReviews.useCase';
import { ListApprovedReviewsUseCase } from './listApprovedReviews.useCase';
import { ModerateReviewUseCase } from './moderateReview.useCase';
import {
  EmailReviewModerationNotifier,
  NoopReviewModerationNotifier,
} from '../adapters/secondary/review-moderation-email.notifier';
import { ReviewRepositoryPg } from '../adapters/secondary/review.repository.pg';

import type { ReviewAuthorLookup } from './moderateReview.useCase';

const reviewRepository = new ReviewRepositoryPg(AppDataSource);
const userRepository = new UserRepositoryPg(AppDataSource);
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
