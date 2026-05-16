import {
  AUDIT_CONSENT_GRANTED,
  AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM,
  AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI,
  AUDIT_CONSENT_GRANTED_TOS,
  AUDIT_CONSENT_REVOKED,
  AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM,
  AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI,
} from '@shared/audit';

const THIRD_PARTY_AI_PREFIX = 'third_party_ai_';

interface ThirdPartyAiBreakdown {
  category: 'text' | 'image' | 'audio' | 'profile';
  provider: 'openai' | 'google';
}

/**
 * Decomposes a `third_party_ai_<category>_<provider>` scope into its parts.
 *
 * Returns `null` when the scope does not match the prefix or carries an
 * unknown category/provider combination. Callers MUST treat `null` as a
 * non-third-party-AI scope (e.g. `tos_privacy`, `analytics`).
 */
export function parseThirdPartyAiScope(scope: string): ThirdPartyAiBreakdown | null {
  if (!scope.startsWith(THIRD_PARTY_AI_PREFIX)) return null;
  const tail = scope.slice(THIRD_PARTY_AI_PREFIX.length);
  const lastUnderscore = tail.lastIndexOf('_');
  if (lastUnderscore === -1) return null;
  const category = tail.slice(0, lastUnderscore);
  const provider = tail.slice(lastUnderscore + 1);
  if (category !== 'text' && category !== 'image' && category !== 'audio' && category !== 'profile')
    return null;
  if (provider !== 'openai' && provider !== 'google') return null;
  return { category, provider };
}

/**
 * Picks the canonical audit action name for a consent grant. Specialised
 * actions (`*_TOS`, `*_THIRD_PARTY_AI`, `*_LOCATION_TO_LLM`) make
 * `WHERE action = …` queries trivial during DPO investigations ; the generic
 * `CONSENT_GRANTED` catches scopes outside those families.
 */
export function mapScopeToGrantAuditAction(scope: string): string {
  if (scope === 'tos_privacy') return AUDIT_CONSENT_GRANTED_TOS;
  if (scope === 'location_to_llm') return AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM;
  if (parseThirdPartyAiScope(scope)) return AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI;
  return AUDIT_CONSENT_GRANTED;
}

/**
 * Picks the canonical audit action name for a consent revoke. Mirrors
 * {@link mapScopeToGrantAuditAction} for the revoke side ; the `*_TOS`
 * scope intentionally has no revoke variant (ToS acceptance is contractually
 * tied to the account lifecycle and revokes flow through account-deletion).
 */
export function mapScopeToRevokeAuditAction(scope: string): string {
  if (scope === 'location_to_llm') return AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM;
  if (parseThirdPartyAiScope(scope)) return AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI;
  return AUDIT_CONSENT_REVOKED;
}

/**
 * Builds the metadata payload for a consent audit row. Third-party AI rows
 * carry `{ provider, category }` so DPO dashboards can pivot by vendor and
 * data class without re-parsing the scope string.
 */
export function buildConsentAuditMetadata(
  scope: string,
  version: string,
  source: string,
): Record<string, unknown> {
  const breakdown = parseThirdPartyAiScope(scope);
  if (breakdown) {
    return {
      scope,
      version,
      source,
      provider: breakdown.provider,
      category: breakdown.category,
    };
  }
  return { scope, version, source };
}
