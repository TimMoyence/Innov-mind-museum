export type SocialProvider = 'apple' | 'google';

export interface SocialTokenPayload {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstname?: string;
  lastname?: string;
}

export interface SocialTokenVerifier {
  verify(
    provider: SocialProvider,
    idToken: string,
    expectedNonce?: string,
  ): Promise<SocialTokenPayload>;
}
