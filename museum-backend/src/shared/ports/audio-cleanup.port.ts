export interface AudioCleanupPort {
  deleteUserAudio(userId: number): Promise<void>;
}

export interface MarketingContactRemovalPort {
  removeContact(email: string): Promise<unknown>;
}

export interface MarketingErasureFallbackPort {
  enqueueBrevoErasure(email: string): Promise<void>;
}

export interface LeadErasurePort {
  deleteByEmail(emailNormalized: string): Promise<number>;
}
