import { logger } from '@shared/logger/logger';
import { screenSubmission } from '@shared/validation/screen-submission';

describe('screenSubmission', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the verdict and logs only a bot, under the form name', () => {
    expect(screenSubmission({ website: 'x', fillMs: 10, requestId: 'r' }, 'beta_signup')).toBe(
      'bot',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('beta_signup_honeypot_triggered', {
      requestId: 'r',
      hasIp: false,
    });

    expect(screenSubmission({ website: 'x', fillMs: 60_000 }, 'beta_signup')).toBe('suspect');
    expect(screenSubmission({ fillMs: 60_000 }, 'beta_signup')).toBe('clean');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
