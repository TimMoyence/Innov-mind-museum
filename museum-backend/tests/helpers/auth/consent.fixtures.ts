import type {
  ConsentScope,
  ConsentSource,
  UserConsent,
} from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

export interface ConsentGrantSpec {
  userId: number;
  scope: ConsentScope;
  version?: string;
  source?: ConsentSource;
}

export const makeConsentGranted = (overrides: Partial<ConsentGrantSpec> = {}): ConsentGrantSpec => {
  return {
    userId: 1,
    scope: 'third_party_ai_text_openai',
    version: '1.0.0',
    source: 'ui',
    ...overrides,
  };
};

export const makeConsentDenied = (overrides: Partial<ConsentGrantSpec> = {}): ConsentGrantSpec => {
  return {
    userId: 1,
    scope: 'third_party_ai_text_openai',
    version: '1.0.0',
    source: 'ui',
    ...overrides,
  };
};

export async function applyConsentGrantSpec(
  repo: IUserConsentRepository,
  spec: ConsentGrantSpec,
): Promise<UserConsent> {
  return await repo.grant(spec.userId, spec.scope, spec.version ?? '1.0.0', spec.source ?? 'ui');
}
