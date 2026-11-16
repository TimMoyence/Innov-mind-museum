import {
  listReportsQuerySchema,
  listReviewsQuerySchema,
  listTicketsQuerySchema,
  resolveReportSchema,
  updateTicketSchema,
  usageAnalyticsQuerySchema,
} from '@modules/admin/adapters/primary/http/schemas/admin.schemas';

const REPORT = ['pending', 'reviewed', 'dismissed'];
const TICKET = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITY = ['low', 'medium', 'high'];
const REVIEW = ['pending', 'approved', 'rejected'];
const GRANULARITY = ['daily', 'weekly', 'monthly'];

describe('STATUTS · admin status and option schemas', () => {
  it.each(REPORT)('STATUTS · resolving a report accepts status %s', (status) => {
    expect(resolveReportSchema.parse({ status })).toEqual({ status });
  });

  it.each(REPORT)('STATUTS · the report list filters on status %s', (status) => {
    expect(listReportsQuerySchema.parse({ status })).toMatchObject({ status });
  });

  it.each(TICKET)('STATUTS · a ticket update and the ticket list accept status %s', (status) => {
    expect(updateTicketSchema.parse({ status })).toEqual({ status });
    expect(listTicketsQuerySchema.parse({ status })).toMatchObject({ status });
  });

  it.each(PRIORITY)(
    'STATUTS · a ticket update and the ticket list accept priority %s',
    (priority) => {
      expect(updateTicketSchema.parse({ priority })).toEqual({ priority });
      expect(listTicketsQuerySchema.parse({ priority })).toMatchObject({ priority });
    },
  );

  it.each(REVIEW)('STATUTS · the review list filters on status %s', (status) => {
    expect(listReviewsQuerySchema.parse({ status })).toMatchObject({ status });
  });

  it.each(GRANULARITY)('STATUTS · usage analytics accept granularity %s', (granularity) => {
    expect(usageAnalyticsQuerySchema.parse({ granularity })).toMatchObject({ granularity });
  });

  it('STATUTS · every schema refuses a value outside its list', () => {
    expect(resolveReportSchema.safeParse({ status: 'closed' }).success).toBe(false);
    expect(resolveReportSchema.safeParse({}).success).toBe(false);
    expect(listReportsQuerySchema.safeParse({ status: 'approved' }).success).toBe(false);
    expect(updateTicketSchema.safeParse({ status: 'pending' }).success).toBe(false);
    expect(updateTicketSchema.safeParse({ priority: 'urgent' }).success).toBe(false);
    expect(listTicketsQuerySchema.safeParse({ status: 'reviewed' }).success).toBe(false);
    expect(listTicketsQuerySchema.safeParse({ priority: 'urgent' }).success).toBe(false);
    expect(listReviewsQuerySchema.safeParse({ status: 'dismissed' }).success).toBe(false);
    expect(usageAnalyticsQuerySchema.safeParse({ granularity: 'hourly' }).success).toBe(false);
  });

  it('STATUTS · optional filters stay absent when not given', () => {
    expect(listReportsQuerySchema.parse({}).status).toBeUndefined();
    expect(listTicketsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listReviewsQuerySchema.parse({}).status).toBeUndefined();
    expect(usageAnalyticsQuerySchema.parse({}).granularity).toBeUndefined();
    expect(updateTicketSchema.parse({})).toEqual({});
  });
});
