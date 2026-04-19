/**
 * Expo config plugin — iOS Podfile fmt consteval patch for Xcode 26+.
 *
 * The `fmt` C++ library guards a consteval branch with:
 *   defined(__apple_build_version__) && __apple_build_version__ < 14000029L
 * Xcode 26 (Apple Clang 17xxx) regresses consteval constant evaluation and
 * falsely rejects valid code. The safe widening is to disable the consteval
 * path for all Apple Clang versions (constexpr fallback is equivalent at
 * runtime). This plugin injects a post_install hook that rewrites the pod
 * after each `pod install`, so the patch survives `expo prebuild --clean`.
 *
 * Without this plugin, the patch would live inline in the generated Podfile
 * and be wiped on every prebuild cycle.
 */

const { withPodfile } = require('@expo/config-plugins');

const PATCH_TAG = '# @musaium/fmt-consteval-patch';

const PATCH_BLOCK = `
    ${PATCH_TAG}
    # Fix fmt consteval errors with Xcode 26+ Apple Clang regression.
    # Widen the Apple Clang guard to disable consteval on all versions.
    fmt_base = File.join(__dir__, 'Pods', 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      patched = content.sub(
        'defined(__apple_build_version__) && __apple_build_version__ < 14000029L',
        'defined(__apple_build_version__)'
      )
      if patched != content
        File.chmod(0644, fmt_base)
        File.write(fmt_base, patched)
      end
    end
`;

function ensureFmtPatch(podfile) {
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

const withFmtConstevalPatch = (config) =>
  withPodfile(config, (c) => {
    c.modResults.contents = ensureFmtPatch(c.modResults.contents);
    return c;
  });

module.exports = withFmtConstevalPatch;
