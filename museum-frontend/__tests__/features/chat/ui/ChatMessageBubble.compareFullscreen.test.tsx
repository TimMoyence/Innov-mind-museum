import '../../../helpers/test-utils';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  makeArtworkFacts,
  makeAssistantMessage,
  makeCompareMatch,
  makeCompareResult,
} from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

beforeEach(() => {
  speakAppLanguage('fr');
});

jest.mock('@/features/chat/ui/MarkdownBubble', () => {
  const { Text } = require('react-native');
  return {
    MarkdownBubble: ({ text }: { text: string }) => <Text testID="markdown-bubble">{text}</Text>,
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

const joconde = makeCompareMatch({
  facts: makeArtworkFacts({ qid: 'Q12418', title: 'La Joconde', artist: 'Léonard de Vinci' }),
  title: 'La Joconde',
  imageUrl: 'https://example.com/joconde.jpg',
  rationale: 'Même composition.',
});

const radeau = makeCompareMatch({
  facts: makeArtworkFacts({
    qid: 'Q1065548',
    title: 'Le Radeau de la Méduse',
    artist: 'Théodore Géricault',
  }),
  title: 'Le Radeau de la Méduse',
  imageUrl: 'https://example.com/radeau.jpg',
  rationale: 'Palette voisine.',
});

const renderCompareBubble = () =>
  render(
    <ChatMessageBubble
      message={makeAssistantMessage({}, { compareResults: makeCompareResult([joconde, radeau]) })}
      isStreaming={false}
      locale="fr-FR"
      onImageError={jest.fn()}
      onReport={jest.fn()}
    />,
  );

describe('Œuvres similaires — un tap sur une carte ouvre la photo en plein écran', () => {
  it('DEC-2026-11-08 · le tap sur la première carte montre sa photo plein écran avec la croix, sans quitter l’appli', () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    renderCompareBubble();

    fireEvent.press(
      screen.getByLabelText('Œuvre similaire : La Joconde, Léonard de Vinci, Même composition.'),
    );

    expect(screen.getByTestId('image-fullscreen-modal-close')).toBeTruthy();
    expect(screen.getByLabelText('La Joconde, Léonard de Vinci')).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('DEC-2026-11-08 · le tap sur la deuxième carte ouvre sa propre photo', () => {
    renderCompareBubble();

    fireEvent.press(
      screen.getByLabelText(
        'Œuvre similaire : Le Radeau de la Méduse, Théodore Géricault, Palette voisine.',
      ),
    );

    expect(screen.getByLabelText('Le Radeau de la Méduse, Théodore Géricault')).toBeTruthy();
    expect(screen.queryByLabelText('La Joconde, Léonard de Vinci')).toBeNull();
  });
});
