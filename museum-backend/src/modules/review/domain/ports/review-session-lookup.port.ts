export interface IReviewSessionLookup {
  findSessionMuseum(sessionId: string, userId: number): Promise<{ museumId: number | null } | null>;
}
