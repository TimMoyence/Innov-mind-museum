
import type { GuardrailAuditContext } from '../guardrail-audit-payload';

/** Closed set of layers exposed as a Prometheus label (bounded cardinality). */
export type GuardrailLayer = 'keyword' | 'provider' | 'judge' | 'classifier';

/** Closed set of locale labels (8 supported + `unknown`). */
const KNOWN_LOCALES: ReadonlySet<string> = new Set([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'zh',
]);

/**
 * Resolves a Prometheus-safe locale label from the audit context. Clips to
 * the closed 8-locale set + `unknown` to keep cardinality bounded — a hostile
 * client cannot inflate label cardinality by sending arbitrary locale strings.
 */
export function resolveLocaleLabel(context: GuardrailAuditContext | undefined): string {
  const raw = context?.locale?.toLowerCase();
  if (raw && KNOWN_LOCALES.has(raw)) return raw;
  return 'unknown';
}

