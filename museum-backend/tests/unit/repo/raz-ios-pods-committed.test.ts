import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MOBILE_ONLY_ACCEPTANCES = ['CVE-2025-71329', 'CVE-2025-71330', 'CVE-2026-118664'];

const ignoreEntries = (path: string): string[] =>
  readFileSync(join(ROOT, path), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

describe('RAZ-M12-XCODE-CLOUD', () => {
  it('RAZ-M12-XCODE-CLOUD · aucun fichier de ios/Pods n’est laissé hors de git par le .gitignore', () => {
    const ignored = execFileSync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', 'museum-frontend/ios/Pods'],
      { cwd: ROOT, encoding: 'utf8' },
    )
      .split('\n')
      .filter((path) => path !== '' && !path.includes('/xcuserdata/'));

    expect(ignored).toEqual([]);
  });

  it('RAZ-M12-XCODE-CLOUD · les CVE acceptées pour le mobile ne masquent que le scan mobile', () => {
    expect(ignoreEntries('.trivyignore')).toEqual(
      expect.not.arrayContaining([expect.stringMatching(MOBILE_ONLY_ACCEPTANCES.join('|'))]),
    );
    expect(ignoreEntries('museum-frontend/.trivyignore')).toEqual(MOBILE_ONLY_ACCEPTANCES);
  });
});
