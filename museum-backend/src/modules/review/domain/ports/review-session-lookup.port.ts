/**
 * NPS attribution port (C2 / R3-R4 / Q1). Lets `CreateReviewUseCase` resolve the
 * museum a review should be attributed to from the VISITED chat session — never
 * from the noter's tenant claim. Cross-module read kept thin (the review module
 * depends on this interface, not on the chat repository concretely — hexagonal,
 * lib-docs/typeorm/PATTERNS.md §9.1).
 */
export interface IReviewSessionLookup {
  /**
   * Returns the session's `museumId` (may be `null`) IF a session with the given
   * id exists AND is owned by `userId`. Returns `null` when the session is
   * missing, not owned, or foreign — the caller cannot distinguish these cases
   * (no existence oracle, R3 / Q1). The id + ownership MUST be filtered in a
   * single query so a foreign session is indistinguishable from a missing one.
   */
  findSessionMuseum(sessionId: string, userId: number): Promise<{ museumId: number | null } | null>;
}
