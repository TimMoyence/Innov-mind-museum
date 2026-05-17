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
 * Decomposes `third_party_ai_<category>_<provider>`. Returns `null` on prefix
 * mismatch or unknown category/provider — callers MUST treat `null` as a
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
 * Specialised actions (`*_TOS`, `*_THIRD_PARTY_AI`, `*_LOCATION_TO_LLM`) make
 * `WHERE action = …` trivial during DPO investigations; generic
 * `CONSENT_GRANTED` catches scopes outside those families.
 */
export function mapScopeToGrantAuditAction(scope: string): string {
  if (scope === 'tos_privacy') return AUDIT_CONSENT_GRANTED_TOS;
  if (scope === 'location_to_llm') return AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM;
  if (parseThirdPartyAiScope(scope)) return AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI;
  return AUDIT_CONSENT_GRANTED;
}

/**
 * Mirrors {@link mapScopeToGrantAuditAction}. `*_TOS` intentionally has no
 * revoke variant — ToS acceptance is tied to account lifecycle; revokes flow
 * through account-deletion.
 */
export function mapScopeToRevokeAuditAction(scope: string): string {
  if (scope === 'location_to_llm') return AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM;
  if (parseThirdPartyAiScope(scope)) return AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI;
  return AUDIT_CONSENT_REVOKED;
}

/** Third-party AI rows carry `{ provider, category }` so DPO dashboards can pivot without re-parsing. */
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
