export type ContentPreference = 'history' | 'technique' | 'artist';

export const CONTENT_PREFERENCES: readonly ContentPreference[] = ['history', 'technique', 'artist'];

export const isContentPreference = (value: unknown): value is ContentPreference =>
  typeof value === 'string' && (CONTENT_PREFERENCES as readonly string[]).includes(value);
