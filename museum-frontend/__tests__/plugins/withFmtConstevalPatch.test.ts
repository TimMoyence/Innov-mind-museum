/**
 * Regression guard for the fmt-consteval Podfile plugin.
 *
 * The plugin's original anchor required `react_native_post_install(` to follow
 * `post_install do |installer|` with only WHITESPACE in between. The day
 * @maplibre/maplibre-react-native started injecting its own `# @generated begin …`
 * comment into that exact gap, the regex stopped matching — and the plugin's
 * no-match branch returned the Podfile UNCHANGED *silently*. Every `expo prebuild`
 * from then on emitted an unpatched Podfile while the plugin still looked wired up
 * in app.config.ts.
 *
 * These tests pin the two properties that failure violated:
 *   1. the anchor survives arbitrary content injected by other plugins;
 *   2. an unrecognised template FAILS LOUD instead of silently no-op'ing.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin is a CommonJS config-plugin, required exactly as Expo requires it
const withFmtConstevalPatch = require('../../plugins/withFmtConstevalPatch.js') as (
  config: unknown,
) => unknown;

interface PodfileConfig {
  modResults: { contents: string };
}

/** Run the plugin's Podfile mod and hand back the resulting Podfile text. */
const runPlugin = (contents: string): string => {
  let captured = contents;
  jest.isolateModules(() => {
    // `withPodfile` is mocked below to invoke the mod synchronously.
    withFmtConstevalPatch({ modResults: { contents } });
  });
  captured = lastContents;
  return captured;
};

let lastContents = '';

jest.mock('@expo/config-plugins', () => ({
  withPodfile: (config: PodfileConfig, mod: (c: PodfileConfig) => PodfileConfig) => {
    const next = mod(config);
    lastContents = next.modResults.contents;
    return next;
  },
}));

const PATCH_TAG = '# @musaium/fmt-consteval-patch';

/** The real-world shape: another config plugin injects a comment right after the opener. */
const podfileWithMaplibreInjection = `
target 'Musaium' do
  use_expo_modules!
  post_install do |installer|
# @generated begin @maplibre/maplibre-react-native:post-install - expo prebuild (DO NOT MODIFY)
    $MLRN.post_install(installer)
# @generated end
    react_native_post_install(
      installer,
      config[:reactNativePath],
    )
  end
end
`;

describe('withFmtConstevalPatch', () => {
  it('injects the patch even when another plugin has already written into the post_install block', () => {
    // The exact case that silently broke: a `# @generated` comment sits between the
    // opener and `react_native_post_install(`.
    const out = runPlugin(podfileWithMaplibreInjection);

    expect(out).toContain(PATCH_TAG);
    // and it must land INSIDE post_install, not before it
    expect(out.indexOf(PATCH_TAG)).toBeGreaterThan(out.indexOf('post_install do |installer|'));
  });

  it('is idempotent — a second prebuild does not double-inject', () => {
    const once = runPlugin(podfileWithMaplibreInjection);
    const twice = runPlugin(once);

    expect(twice.split(PATCH_TAG)).toHaveLength(2); // i.e. exactly one occurrence
  });

  it('THROWS on an unrecognised Podfile instead of silently shipping it unpatched', () => {
    // A silent no-op is what let an unpatched Podfile reach CI for months. If the
    // Expo template ever moves, we want a loud red at prebuild, not a mystery
    // compile error on a toolchain we cannot reproduce locally.
    expect(() => runPlugin('target "Musaium" do\n  use_expo_modules!\nend\n')).toThrow(
      /post_install do \|installer\| not found|not found in the generated/i,
    );
  });
});
