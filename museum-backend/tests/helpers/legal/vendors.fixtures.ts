export interface VendorChecklistEntry {
  name: string;
  category: 'LLM' | 'infra' | 'email' | 'monitoring' | 'search' | 'mapping' | 'auth' | 'uptime';
  searchAliases: string[];
}

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

export type PublicSurface = 'museum-web' | 'museum-frontend';

export function surfaceMentionsVendor(surfaceText: string, vendor: VendorChecklistEntry): boolean {
  const haystack = surfaceText.toLowerCase();
  return vendor.searchAliases.some((alias) => haystack.includes(alias.toLowerCase()));
}
