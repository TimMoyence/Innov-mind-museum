import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { RecommendationChips } from '@/features/chat/ui/RecommendationChips';

describe('RecommendationChips', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when recommendations array is empty', () => {
    const { toJSON } = render(<RecommendationChips recommendations={[]} onPress={onPress} />);
    expect(toJSON()).toBeNull();
  });

  it('renders section label and chip texts', () => {
    render(
      <RecommendationChips
        recommendations={['Tell me about Mona Lisa', 'Who painted this?']}
        onPress={onPress}
      />,
    );

    expect(screen.getByText('recommendationChips.section_label')).toBeTruthy();
    expect(screen.getByText('Tell me about Mona Lisa')).toBeTruthy();
    expect(screen.getByText('Who painted this?')).toBeTruthy();
  });

  it('fires onPress with recommendation text when a chip is pressed', () => {
    render(<RecommendationChips recommendations={['Tell me about Mona Lisa']} onPress={onPress} />);

    const chip = screen.getByLabelText('Tell me about Mona Lisa');
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledWith('Tell me about Mona Lisa');
  });

  it('renders chips as disabled when disabled prop is true', () => {
    render(<RecommendationChips recommendations={['Chip A']} onPress={onPress} disabled />);

    const chip = screen.getByLabelText('Chip A');
    expect(chip.props.accessibilityState?.disabled).toBe(true);
  });
});
