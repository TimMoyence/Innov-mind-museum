/**
 * Feature flag service for safe rollout of new features.
 * Default behavior: all flags are OFF unless explicitly enabled via environment variables.
 */
export interface FeatureFlagService {
  isEnabled(flag: string): boolean;
}

/** Static feature flag service backed by environment variables. */
export class StaticFeatureFlagService implements FeatureFlagService {
  private readonly flags: Map<string, boolean>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.flags = new Map();
    // Parse all FEATURE_FLAG_* env vars
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('FEATURE_FLAG_')) {
        const flagName = key.replace('FEATURE_FLAG_', '').toLowerCase().replace(/_/g, '-');
        this.flags.set(flagName, value === 'true' || value === '1');
      }
    }
  }

  /** Returns whether the given feature flag is enabled. */
  isEnabled(flag: string): boolean {
    return this.flags.get(flag) ?? false;
  }
}
