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
      expect(flattened.justifyContent).toBe('center');
      expect(typeof flattened.minHeight).toBe('number');
      expect(flattened.minHeight).toBeGreaterThan(0);
    }
  });

  it("center-aligns each option's label text", () => {
    const { getByText } = render(<DataModeSettingsSection />);
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
