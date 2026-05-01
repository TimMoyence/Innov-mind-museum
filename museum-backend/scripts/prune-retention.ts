import 'dotenv/config';
import 'reflect-metadata';

import { AppDataSource } from '@data/db/data-source';
import { pruneStaleArtKeywords } from '@modules/chat/useCase/prune-stale-art-keywords';
import { pruneReviews } from '@modules/review/useCase/prune-reviews';
import { pruneSupportTickets } from '@modules/support/useCase/prune-support-tickets';
import { env } from '@src/config/env';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Running retention prune (manual)...');

  const support = await pruneSupportTickets(AppDataSource, {
    daysClosed: env.retention.supportTicketsDays,
    batchLimit: env.retention.batchLimit,
  });
  console.log('support_tickets:', support);

  const reviews = await pruneReviews(AppDataSource, {
    rejectedDays: env.retention.reviewsRejectedDays,
    pendingDays: env.retention.reviewsPendingDays,
    batchLimit: env.retention.batchLimit,
  });
  console.log('reviews:', reviews);

  const artKeywords = await pruneStaleArtKeywords(AppDataSource, {
    days: env.retention.artKeywordsDays,
    hitThreshold: env.retention.artKeywordsHitThreshold,
    batchLimit: env.retention.batchLimit,
  });
  console.log('art_keywords:', artKeywords);

  await AppDataSource.destroy();
  console.log('Retention prune complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
