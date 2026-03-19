/** User-selectable expertise level controlling the depth of AI-generated explanations. */
export type GuideLevel = 'beginner' | 'intermediate' | 'expert';

/** Persisted user preferences that influence chat behavior and UI defaults. */
export interface RuntimeSettings {
  defaultLocale: string;
  defaultMuseumMode: boolean;
  guideLevel: GuideLevel;
}

export const defaults: RuntimeSettings = {
  defaultLocale: 'en-US',
  defaultMuseumMode: true,
  guideLevel: 'beginner',
};

export const normalizeGuideLevel = (value: string | null): GuideLevel => {
  if (value === 'expert' || value === 'intermediate' || value === 'beginner') {
    return value;
  }
  return defaults.guideLevel;
};
