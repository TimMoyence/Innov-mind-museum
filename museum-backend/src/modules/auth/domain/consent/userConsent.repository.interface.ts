import type { ConsentScope, ConsentSource, UserConsent } from './userConsent.entity';

export interface IUserConsentRepository {
  grant(
    userId: number,
    scope: ConsentScope,
    version: string,
    source: ConsentSource,
  ): Promise<UserConsent>;

  revoke(userId: number, scope: ConsentScope): Promise<void>;

  isGranted(userId: number, scope: ConsentScope): Promise<boolean>;

  listForUser(userId: number): Promise<UserConsent[]>;
}
