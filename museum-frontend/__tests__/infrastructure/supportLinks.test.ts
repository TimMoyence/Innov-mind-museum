import '../helpers/test-utils';

import { getReadySupportChannels, isValidSupportUrl } from '@/shared/config/supportLinks';

describe('supportLinks', () => {
  it('returns only production-ready channels', () => {
    const readyChannels = getReadySupportChannels();
    const readyKeys = readyChannels.map(([key]) => key);

    expect(readyKeys).toEqual(['telegram']);
  });

  it('validates only https support URLs', () => {
    expect(isValidSupportUrl('https://t.me/musaium_support')).toBe(true);
    expect(isValidSupportUrl('http://t.me/musaium_support')).toBe(false);
    expect(isValidSupportUrl('not a url')).toBe(false);
  });
});
