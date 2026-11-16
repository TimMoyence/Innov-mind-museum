import { describe, it, expect } from 'vitest';

import { ANALYTICS_GRANULARITIES, REPORT_STATUSES, allOf } from '@/lib/admin-types';

describe('admin option lists', () => {
  it('allOf lists every member once, in declaration order', () => {
    expect(allOf<'b' | 'a' | 'c'>({ b: true, a: true, c: true })).toEqual(['b', 'a', 'c']);
  });

  it('REPORT_STATUSES lists every report status in filter order', () => {
    expect(REPORT_STATUSES).toEqual(['pending', 'reviewed', 'dismissed']);
  });

  it('ANALYTICS_GRANULARITIES lists every granularity from the finest', () => {
    expect(ANALYTICS_GRANULARITIES).toEqual(['daily', 'weekly', 'monthly']);
  });
});
