import { describe, it, expect } from 'vitest';
import {
  MODERATION_STATUSES,
  MUSEUM_TYPES,
  REVIEW_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from './admin-types';

describe('admin-types.ts — constants', () => {
  it('TICKET_STATUSES contains all expected values', () => {
    expect(TICKET_STATUSES).toEqual(['open', 'in_progress', 'resolved', 'closed']);
  });

  it('TICKET_PRIORITIES contains all expected values', () => {
    expect(TICKET_PRIORITIES).toEqual(['low', 'medium', 'high']);
  });

  it('REVIEW_STATUSES lists every review status in filter order', () => {
    expect(REVIEW_STATUSES).toEqual(['pending', 'approved', 'rejected']);
  });

  it('MODERATION_STATUSES offers only the two moderation outcomes', () => {
    expect(MODERATION_STATUSES).toEqual(['approved', 'rejected']);
  });

  it('MUSEUM_TYPES lists every museum type in form order', () => {
    expect(MUSEUM_TYPES).toEqual(['art', 'history', 'science', 'specialized', 'general']);
  });
});
