/**
 * Expo config plugin — pin the ExpoModulesCore pod target to the Swift 5
 * language mode.
 *
 * expo-modules-core@55.0.20's podspec declares `s.swift_version = '6.0'`, so
 * CocoaPods compiles the ExpoModulesCore target with `-swift-version 6`. Under
 * the Swift 6.1 toolchain shipped in Xcode 16.4 (which GitHub's unpinned
 * `macos-latest` image now selects), the pod's SwiftUI / concurrency sources
 * fail strict actor-isolation / Sendable checking with ~48 hard errors
 * (e.g. "main actor-isolated property 'props' can not be referenced from a
 * nonisolated context", "non-sendable type ... in an isolated closure"),
 * which makes `CompileSwift normal arm64 (in target 'ExpoModulesCore' …)` fail
 * and xcodebuild exit 65 — the iOS Maestro nightly build never produces an app.
 *
 * Pinning the target back to `SWIFT_VERSION = 5.0` re-runs the same Swift 6.1
 * compiler in the Swift 5 language mode, where those strict-concurrency
 * diagnostics are not errors, so the pod compiles again. This mirrors the
 * upstream Expo guidance for SDKs whose modules are not yet Swift-6-clean.
 *
 * Delivered as a config plugin (not an inline Podfile edit) because the iOS
 * job runs `expo prebuild --platform ios --clean`, which regenerates ios/ and
 * overwrites the committed Podfile — only plugin-injected post_install hooks
 * survive (same mechanism as plugins/withFmtConstevalPatch.js).
 */

const { withPodfile } = require('@expo/config-plugins');

const PATCH_TAG = '# @musaium/expo-modules-swift-version';

const PATCH_BLOCK = `
    ${PATCH_TAG}
    # Pin ExpoModulesCore to the Swift 5 language mode — its podspec opts into
    # swift_version 6.0, which fails strict actor-isolation/Sendable checking
    # under the Xcode 16.4 Swift 6.1 toolchain (CompileSwift → exit 65).
    installer.pods_project.targets.each do |target|
      if target.name == 'ExpoModulesCore'
        target.build_configurations.each do |config|
          config.build_settings['SWIFT_VERSION'] = '5.0'
        end
      end
    end
`;

function ensureSwiftVersionPatch(podfile) {
  if (podfile.includes(PATCH_TAG)) {
    return podfile;
  }
  const anchor = /post_install do \|installer\|\n(\s+react_native_post_install\([\s\S]*?\)\n)/;
  const match = anchor.exec(podfile);
  if (!match) {
    // Template unrecognised — skip silently rather than corrupt the Podfile.
    return podfile;
  }
  const insertPoint = match.index + match[0].length;
  return podfile.slice(0, insertPoint) + PATCH_BLOCK + podfile.slice(insertPoint);
}

const withExpoModulesSwiftVersion = (config) =>
  withPodfile(config, (c) => {
    c.modResults.contents = ensureSwiftVersionPatch(c.modResults.contents);
    return c;
  });

module.exports = withExpoModulesSwiftVersion;
