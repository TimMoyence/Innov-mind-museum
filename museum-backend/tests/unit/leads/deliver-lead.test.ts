import { deliverLead } from '@modules/leads/useCase/deliver-lead';
import { logger } from '@shared/logger/logger';

import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

describe('deliverLead', () => {
  const lead = { id: 'lead-1', type: 'beta' as const };
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the provider outcome once the lead is marked delivered', async () => {
    const repository = makeStubLeadRepository();

    const delivery = await deliverLead({
      repository,
      lead,
      send: () => Promise.resolve('accepted'),
      context: { via: 'redelivery' },
      failureContext: { emailDomain: 'example.org' },
    });

    expect(delivery).toEqual({ delivered: true, outcome: 'accepted' });
    expect(repository.delivered).toEqual(['lead-1']);
    expect(info).toHaveBeenCalledWith('lead_delivered', {
      leadId: 'lead-1',
      type: 'beta',
      via: 'redelivery',
    });
  });

  it('marks the lead failed, runs the failure follow-up before logging, and never throws', async () => {
    const repository = makeStubLeadRepository();
    const order: string[] = [];
    warn.mockImplementation(() => order.push('log'));

    const delivery = await deliverLead({
      repository,
      lead,
      send: () => Promise.reject(new RangeError('quota')),
      context: { via: 'redelivery' },
      failureContext: { emailDomain: 'example.org' },
      onFailed: () => {
        order.push('follow-up');
        return Promise.resolve();
      },
    });

    expect(delivery).toEqual({ delivered: false });
    expect(repository.failed).toEqual([
      { id: 'lead-1', lastError: expect.stringContaining('quota') },
    ]);
    expect(order).toEqual(['follow-up', 'log']);
    expect(warn).toHaveBeenCalledWith('lead_delivery_failed', {
      leadId: 'lead-1',
      type: 'beta',
      via: 'redelivery',
      emailDomain: 'example.org',
      errorClass: 'RangeError',
    });
  });

  it('names an unknown error class when the failure is not an Error', async () => {
    await deliverLead({
      repository: makeStubLeadRepository(),
      lead,
      send: () => Promise.reject(new Error('x')).catch(() => Promise.reject('plain')),
    });

    expect(warn).toHaveBeenCalledWith(
      'lead_delivery_failed',
      expect.objectContaining({ errorClass: 'unknown' }),
    );
  });
});
