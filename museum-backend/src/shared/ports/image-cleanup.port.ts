/**
 * Optional hook: fetches legacy image references (pre-user-scoped key format)
 * for a given user. Passed to `ImageCleanupPort.deleteByPrefix` to clean up
 * historical records that don't sit under `chat-images/user-<userId>/`.
 */
export type LegacyImageKeyFetcher = (userId: number) => Promise<string[]>;

/**
 * Cross-module port for GDPR right-to-erasure image cleanup. Lives in `shared/`
 * so the auth module's `DeleteAccountUseCase` can depend on the contract
 * without taking a static-type dependency on the chat module — chat's
 * `ImageStorage` adapter implements this port structurally, and the runtime
 * proxy still bridges the two via lazy import to avoid circular init.
 *
 * Implementations MUST:
 * - List & delete all objects under the `chat-images/user-<userId>/` prefix.
 * - Optionally call `legacyFetcher` to retrieve keys for historical records
 *   that predate the user-scoped key format, and delete those directly.
 */
export interface ImageCleanupPort {
  deleteByPrefix(userId: number | string, legacyFetcher?: LegacyImageKeyFetcher): Promise<void>;
}
