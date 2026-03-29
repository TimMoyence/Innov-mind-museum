/**
 * Review module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { AppDataSource } from '@src/data/db/data-source';

import { CreateReviewUseCase } from './createReview.useCase';
import { GetReviewStatsUseCase } from './getReviewStats.useCase';
import { ListAllReviewsUseCase } from './listAllReviews.useCase';
import { ListApprovedReviewsUseCase } from './listApprovedReviews.useCase';
import { ModerateReviewUseCase } from './moderateReview.useCase';
import { ReviewRepositoryPg } from '../adapters/secondary/review.repository.pg';

const reviewRepository = new ReviewRepositoryPg(AppDataSource);

export const createReviewUseCase = new CreateReviewUseCase(reviewRepository);
export const listApprovedReviewsUseCase = new ListApprovedReviewsUseCase(reviewRepository);
export const listAllReviewsUseCase = new ListAllReviewsUseCase(reviewRepository);
export const moderateReviewUseCase = new ModerateReviewUseCase(reviewRepository);
export const getReviewStatsUseCase = new GetReviewStatsUseCase(reviewRepository);
