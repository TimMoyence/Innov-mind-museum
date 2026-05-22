/**
 * Canonical subprocessor list (R11 in spec.md) — 19 vendors.
 *
 * Source of truth for B15 vendor-disclosure tests. Mirrors the exhaustive list
 * declared in `team-state/2026-05-21-p0-gdpr/spec.md` §3 R11.
 *
 * Tests grep for `searchAliases[0]` (the primary name) on each of the 3
 * surfaces (HTML / museum-web / museum-frontend). Aliases are kept for
 * surfaces that already use a localised/abbreviated form (e.g. HTML shows
 * "OpenAI, LLC" → primary "OpenAI" still matches case-insensitively).
 *
 * Do NOT inline this list in tests — share via this factory (CLAUDE.md test
 * discipline DRY rule, UFR-002).
 */
export interface VendorChecklistEntry {
  /** Primary canonical name used in tests as the search needle. */
  name: string;
  /** Functional category (mirrors design §4 `Subprocessor.category`). */
  category:
    | 'LLM'
    | 'infra'
    | 'email'
    | 'monitoring'
    | 'search'
    | 'mapping'
    | 'auth'
    | 'telemetry'
    | 'uptime';
  /**
   * Alternative names accepted on surfaces that already use a slightly
   * different rendering (e.g. trailing "LLC", abbreviations, French
   * localisations). Tests assert each surface contains AT LEAST one of these
   * for the vendor.
   */
  searchAliases: string[];
}

/**
 * The 19 subprocessors per R11. Order matches spec.md §3 R11 verbatim.
 */
export const CANONICAL_VENDORS: readonly VendorChecklistEntry[] = [
  { name: 'OpenAI', category: 'LLM', searchAliases: ['OpenAI'] },
  {
    name: 'Google Cloud',
    category: 'LLM',
    searchAliases: ['Google Cloud', 'Vertex AI', 'Google Cloud / Vertex AI'],
  },
  { name: 'DeepSeek', category: 'LLM', searchAliases: ['DeepSeek'] },
  { name: 'OVH SAS', category: 'infra', searchAliases: ['OVH SAS', 'OVH'] },
  {
    name: 'Amazon Web Services',
    category: 'infra',
    searchAliases: ['Amazon Web Services', 'AWS'],
  },
  { name: 'Expo', category: 'infra', searchAliases: ['Expo', 'EAS', 'Expo/EAS', 'Expo / EAS'] },
  { name: 'Brevo', category: 'email', searchAliases: ['Brevo'] },
  { name: 'Sentry', category: 'monitoring', searchAliases: ['Sentry'] },
  {
    name: 'Apple',
    category: 'auth',
    searchAliases: ['Apple', 'Sign in with Apple', 'Apple (Sign in with Apple)'],
  },
  { name: 'Tavily', category: 'search', searchAliases: ['Tavily'] },
  { name: 'Brave', category: 'search', searchAliases: ['Brave'] },
  { name: 'Unsplash', category: 'search', searchAliases: ['Unsplash'] },
  { name: 'Langfuse', category: 'telemetry', searchAliases: ['Langfuse'] },
  {
    name: 'CARTO',
    category: 'mapping',
    searchAliases: ['CARTO', 'CartoDB', 'CARTO (CartoDB tiles)'],
  },
  { name: 'Wikidata', category: 'search', searchAliases: ['Wikidata'] },
  {
    name: 'Wikimedia',
    category: 'search',
    searchAliases: ['Wikimedia', 'Wikipedia REST', 'Wikimedia (Wikipedia REST)'],
  },
  { name: 'Nominatim', category: 'mapping', searchAliases: ['Nominatim'] },
  {
    name: 'OpenStreetMap Foundation',
    category: 'mapping',
    searchAliases: ['OpenStreetMap Foundation', 'OSMF', 'Overpass', 'OpenStreetMap'],
  },
  { name: 'Better-Stack', category: 'uptime', searchAliases: ['Better-Stack', 'Better Stack'] },
] as const;

/**
 * Surface identifiers (used in test diagnostics + drift sentinel messages).
 */
export type PublicSurface = 'HTML' | 'museum-web' | 'museum-frontend';

/**
 * Build a per-surface, case-insensitive predicate: does the rendered/source
 * text mention at least one alias for the given vendor?
 */
export function surfaceMentionsVendor(surfaceText: string, vendor: VendorChecklistEntry): boolean {
  const haystack = surfaceText.toLowerCase();
  return vendor.searchAliases.some((alias) => haystack.includes(alias.toLowerCase()));
}
