import type { GuardrailAuditContext } from '../guardrail-audit-payload';

export type GuardrailLayer = 'keyword' | 'provider' | 'judge' | 'classifier';

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

export function resolveLocaleLabel(context: GuardrailAuditContext | undefined): string {
  const raw = context?.locale?.toLowerCase();
  if (raw && KNOWN_LOCALES.has(raw)) return raw;
  return 'unknown';
}
