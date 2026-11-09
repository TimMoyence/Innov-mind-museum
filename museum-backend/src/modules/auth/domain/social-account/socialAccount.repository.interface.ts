export interface SocialAccountRow {
  id: string;
  userId: number;
  provider: string;
  providerUserId: string;
  email: string | null;
  createdAt: Date;
}

export interface ISocialAccountRepository {
  findByProviderAndProviderUserId(
    provider: string,
    providerUserId: string,
  ): Promise<SocialAccountRow | null>;

  findByUserId(userId: number): Promise<SocialAccountRow[]>;

  create(params: {
    userId: number;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<SocialAccountRow>;

  deleteByUserId(userId: number): Promise<void>;
}
