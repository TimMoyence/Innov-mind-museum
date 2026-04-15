/**
 * Aspects a visitor prefers to learn about an artwork. Mirrors the backend
 * `ContentPreference` domain type. Single frontend source of truth.
 */
export type ContentPreference = 'history' | 'technique' | 'artist';

/** Exhaustive list (runtime source of truth). */
export const CONTENT_PREFERENCES: readonly ContentPreference[] = ['history', 'technique', 'artist'];
