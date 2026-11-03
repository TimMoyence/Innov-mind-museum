import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface EasProfile {
  extends?: string;
  ios?: { image?: string };
}

const eas = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../museum-frontend/eas.json'), 'utf8'),
) as { build: Record<string, EasProfile> };

const iosImage = (name: string): string | undefined => {
  const profile = eas.build[name];
  return profile.ios?.image ?? (profile.extends ? iosImage(profile.extends) : undefined);
};

describe('RAZ-M15-EAS-XCODE-26', () => {
  it.each(Object.keys(eas.build))(
    'RAZ-M15-EAS-XCODE-26 · le profil EAS %s compile iOS sur l’image Xcode 26 d’Expo SDK 55',
    (name) => {
      expect(iosImage(name)).toBe('sdk-55');
    },
  );
});
