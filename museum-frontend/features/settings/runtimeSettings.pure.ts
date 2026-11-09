export type GuideLevel = 'beginner' | 'intermediate' | 'expert';

export interface RuntimeSettings {
  defaultMuseumMode: boolean;
  guideLevel: GuideLevel;
}

export const defaults: RuntimeSettings = {
  defaultMuseumMode: true,
  guideLevel: 'beginner',
};

export const normalizeGuideLevel = (value: string | null): GuideLevel => {
  if (value === 'expert' || value === 'intermediate' || value === 'beginner') {
    return value;
  }
  return defaults.guideLevel;
};
