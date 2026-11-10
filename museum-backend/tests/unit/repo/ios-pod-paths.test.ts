import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const IOS = resolve(__dirname, '../../../../museum-frontend/ios');
const SCRIPT = join(IOS, 'scripts/relative_pod_paths.rb');

const ABSOLUTE_XCCONFIG = [
  'GCC_PREPROCESSOR_DEFINITIONS = $(inherited) COCOAPODS=1',
  'HERMES_CLI_PATH = /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/node_modules/hermes-compiler/hermesc/osx-bin/hermesc',
  '',
].join('\n');

const ABSOLUTE_EXPO = [
  'with_node \\',
  '  --target "/Users/someone/repo/museum-frontend/ios/Pods/Target Support Files/Pods-Musaium/ExpoModulesProvider.swift" \\',
  '  --entitlement "/Users/someone/repo/museum-frontend/ios/Musaium/Musaium.entitlements" \\',
  '',
].join('\n');

const relativize = (podsRoot: string) =>
  spawnSync('ruby', [SCRIPT, podsRoot], { encoding: 'utf8' });

describe('IOS-POD-PATHS', () => {
  it('IOS-POD-PATHS · aucun fichier versionné des Pods ne porte le chemin d’une machine', () => {
    const tracked = spawnSync('git', ['ls-files', 'Pods/Target Support Files'], {
      cwd: IOS,
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .filter(Boolean);
    const absolute = tracked.filter((file) =>
      readFileSync(join(IOS, file), 'utf8').includes('/Users/'),
    );

    expect(tracked.length).toBeGreaterThan(0);
    expect(absolute).toEqual([]);
  });

  it('IOS-POD-PATHS · le script rend Hermes et la configuration d’Expo relatifs à PODS_ROOT, et un second passage ne change rien', () => {
    const podsRoot = mkdtempSync(join(tmpdir(), 'pods-'));
    const support = join(podsRoot, 'Target Support Files', 'Pods-Musaium');
    mkdirSync(support, { recursive: true });
    writeFileSync(join(support, 'Pods-Musaium.release.xcconfig'), ABSOLUTE_XCCONFIG);
    writeFileSync(join(support, 'expo-configure-project.sh'), ABSOLUTE_EXPO);

    expect(relativize(podsRoot).status).toBe(0);
    const xcconfig = readFileSync(join(support, 'Pods-Musaium.release.xcconfig'), 'utf8');
    const expo = readFileSync(join(support, 'expo-configure-project.sh'), 'utf8');

    expect(xcconfig).toContain(
      'HERMES_CLI_PATH = $(PODS_ROOT)/hermes-engine/destroot/bin/hermesc\n',
    );
    expect(xcconfig).toContain('GCC_PREPROCESSOR_DEFINITIONS = $(inherited) COCOAPODS=1\n');
    expect(expo).toContain(
      '--target "${PODS_ROOT}/Target Support Files/Pods-Musaium/ExpoModulesProvider.swift"',
    );
    expect(expo).toContain('--entitlement "${PODS_ROOT}/../Musaium/Musaium.entitlements"');

    expect(relativize(podsRoot).status).toBe(0);
    expect(readFileSync(join(support, 'Pods-Musaium.release.xcconfig'), 'utf8')).toBe(xcconfig);
    expect(readFileSync(join(support, 'expo-configure-project.sh'), 'utf8')).toBe(expo);
  });

  it('IOS-POD-PATHS · pod install réapplique le script, et Xcode Cloud ne corrige plus rien à la volée', () => {
    const podfile = readFileSync(join(IOS, 'Podfile'), 'utf8');
    const preBuild = readFileSync(join(IOS, 'ci_scripts/ci_pre_xcodebuild.sh'), 'utf8');

    expect(podfile).toContain("require_relative 'scripts/relative_pod_paths'");
    expect(podfile).toMatch(
      /post_integrate do \|installer\|\n\s+MusaiumPodPaths\.relativize\(File\.join\(__dir__, 'Pods'\)\)\n\s+end/,
    );
    expect(preBuild).not.toContain('HERMES_CLI_PATH');
    expect(preBuild).not.toContain('expo-configure-project.sh');
  });
});
