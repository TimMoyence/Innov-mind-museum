import '../../../helpers/test-utils';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  makeArtworkFacts,
  makeAssistantMessage,
  makeCompareMatch,
  makeCompareResult,
} from '../../../helpers/factories';

jest.mock('@/features/chat/ui/MarkdownBubble', () => {
  const { Text } = require('react-native');
  return {
    MarkdownBubble: ({ text }: { text: string }) => <Text testID="markdown-bubble">{text}</Text>,
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

const nympheas = makeCompareMatch({
  facts: makeArtworkFacts({ qid: 'Q3415174', title: 'Les Nymphéas', artist: undefined }),
  title: 'Les Nymphéas',
  imageUrl: 'https://example.com/nympheas.jpg',
  rationale: 'Même palette.',
});

describe('Œuvres similaires — une œuvre sans artiste connu', () => {
  it('BREAKER-2026-11-09 · la carte et la photo plein écran ne nomment que le titre', () => {
    render(
      <ChatMessageBubble
        message={makeAssistantMessage({}, { compareResults: makeCompareResult([nympheas]) })}
        isStreaming={false}
        locale="fr-FR"
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText('Œuvre similaire : Les Nymphéas, Même palette.'));

    expect(screen.getByTestId('image-fullscreen-modal-close')).toBeTruthy();
    expect(screen.getByLabelText('Les Nymphéas')).toBeTruthy();
  });
});
