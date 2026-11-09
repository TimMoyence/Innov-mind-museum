import '../helpers/test-utils';
import { ScrollView, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { RecommendationChips } from '@/features/chat/ui/RecommendationChips';

const LONG_PISTE =
  'Jean-Baptiste Bory et les ingénieurs des Ponts et Chaussées sous le Premier Empire';

describe('M10 · les cartes Pistes à explorer montrent leur texte', () => {
  it('M10 · la rangée ne s’étire pas en hauteur et le texte d’une carte rétrécit au lieu de déborder', () => {
    render(<RecommendationChips recommendations={[LONG_PISTE]} onPress={jest.fn()} />);

    const row = StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.style);
    const label = StyleSheet.flatten(screen.getByText(LONG_PISTE).props.style);

    expect(screen.getByText(LONG_PISTE)).toBeTruthy();
    expect(row?.flexGrow).toBe(0);
    expect(label?.flexShrink).toBe(1);
  });
});
