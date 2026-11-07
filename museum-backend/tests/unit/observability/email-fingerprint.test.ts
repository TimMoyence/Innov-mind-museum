import { hashEmail } from '@musaium/shared';

import { scrubEvent } from '@shared/observability/sentry-scrubber';

describe('empreinte d’email Sentry', () => {
  it('EMPREINTE · l’API donne à une adresse la même empreinte que le mobile et le web, pour relier les erreurs d’un même visiteur', () => {
    const scrubbed = scrubEvent({ user: { email: 'alice@example.com' } });

    expect(scrubbed.user?.email).toBeUndefined();
    expect((scrubbed.user as Record<string, unknown>).email_hash).toBe(
      hashEmail('alice@example.com'),
    );
  });
});
