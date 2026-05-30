/**
 * Tests for {@link DataModeSettingsSection} (QA-07).
 *
 * The section renders 3 option buttons (auto / low / normal) as a row, each
 * with `accessibilityRole="radio"` and a `<Text>` label. The `low` label
 * ("Économie activée") wraps onto 2 lines while `auto` / `normal` fit on one,
 * which made the single-line labels look glued to the top of their block.
 *
 * QA-07 fix (this contract):
 *   - `styles.optionButton` must center its content vertically AND give every
 *     option an equal height: it must resolve to `justifyContent: 'center'`
 *     plus a `minHeight` (so a 1-line block matches the 2-line block height).
 *   - `styles.optionLabel` must resolve to `textAlign: 'center'`.
 *
 * RTL-safe: only `center` (never Left/Right) — see CLAUDE.md § Pièges connus.
 *
 * Pre-fix the source sets neither `justifyContent`/`minHeight` on the button
 * nor `textAlign` on the label, so every assertion below fails.
 */
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import '../../helpers/test-utils';
import { DataModeSettingsSection } from '@/features/settings/ui/DataModeSettingsSection';

describe('DataModeSettingsSection (QA-07)', () => {
  it('renders one radio option per data mode (auto / low / normal)', () => {
    const { getAllByRole } = render(<DataModeSettingsSection />);
    expect(getAllByRole('radio')).toHaveLength(3);
  });

  it('vertically centers each option block and gives them an equal minHeight', () => {
    const { getAllByRole } = render(<DataModeSettingsSection />);
    const options = getAllByRole('radio');
    expect(options).toHaveLength(3);

    for (const option of options) {
      const flattened = StyleSheet.flatten(option.props.style) as {
        justifyContent?: string;
        minHeight?: number;
      };
      // Centers the (possibly 1-line) label inside the (possibly 2-line) block.
      expect(flattened.justifyContent).toBe('center');
      // Equal heights so single-line blocks match the wrapping `low` block.
      expect(typeof flattened.minHeight).toBe('number');
      expect(flattened.minHeight).toBeGreaterThan(0);
    }
  });

  it("center-aligns each option's label text", () => {
    const { getByText } = render(<DataModeSettingsSection />);
    // The i18n mock (helpers/test-utils) returns the key verbatim, so each
    // option label renders as its i18n key.
    const labelKeys = [
      'settings.dataMode.auto',
      'settings.dataMode.low',
      'settings.dataMode.normal',
    ];

    for (const key of labelKeys) {
      const label = getByText(key);
      const flattened = StyleSheet.flatten(label.props.style) as {
        textAlign?: string;
      };
      expect(flattened.textAlign).toBe('center');
    }
  });
});
