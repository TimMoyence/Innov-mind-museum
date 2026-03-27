import { describe, it, expect } from 'vitest';
import { TICKET_STATUSES, TICKET_PRIORITIES } from './admin-types';

describe('admin-types.ts — constants', () => {
  it('TICKET_STATUSES contains all expected values', () => {
    expect(TICKET_STATUSES).toEqual(['open', 'in_progress', 'resolved', 'closed']);
  });

  it('TICKET_PRIORITIES contains all expected values', () => {
    expect(TICKET_PRIORITIES).toEqual(['low', 'medium', 'high']);
  });
});
