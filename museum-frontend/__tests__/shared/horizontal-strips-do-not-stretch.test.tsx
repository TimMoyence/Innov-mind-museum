import '../helpers/test-utils';
import { ScrollView, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { WalkSuggestionChips } from '@/features/chat/ui/WalkSuggestionChips';
import type * as FloatingContextMenuModule from '@/shared/ui/FloatingContextMenu';

const { FloatingContextMenu } = jest.requireActual<typeof FloatingContextMenuModule>(
  '@/shared/ui/FloatingContextMenu',
);

const rowGrowth = () =>
  StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.style)?.flexGrow;

describe('M2 · une bande horizontale ne s’étire jamais en hauteur', () => {
  it('M2 · les suggestions de balade gardent la hauteur de leurs puces sous le fil du chat', () => {
    render(<WalkSuggestionChips suggestions={['Salle des Rubens']} onSelect={jest.fn()} />);

    expect(screen.getByText('Salle des Rubens')).toBeTruthy();
    expect(rowGrowth()).toBe(0);
  });

  it('M2 · le menu flottant défilant garde la hauteur de ses boutons', () => {
    render(
      <FloatingContextMenu
        scrollable
        actions={[{ id: 'back', icon: 'arrow-back-outline', label: 'Retour', onPress: jest.fn() }]}
      />,
    );

    expect(screen.getByText('Retour')).toBeTruthy();
    expect(rowGrowth()).toBe(0);
  });
});
