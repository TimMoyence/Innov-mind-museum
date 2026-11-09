import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeAssistantMessage, makeCitationSource } from '../../../helpers/factories';

jest.mock('@/features/chat/ui/MarkdownBubble', () => {
  const { Text } = require('react-native');
  return {
    MarkdownBubble: ({ text }: { text: string }) => <Text testID="markdown-bubble">{text}</Text>,
  };
});

import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

const renderAnswer = (sources: ReturnType<typeof makeCitationSource>[]) =>
  render(
    <ChatMessageBubble
      message={makeAssistantMessage(
        { text: 'Le Pont de Pierre a été achevé en 1822.' },
        { sources },
      )}
      isStreaming={false}
      locale="fr"
      onImageError={jest.fn()}
      onReport={jest.fn()}
    />,
  );

describe('M8 · aucune pastille de confiance ni de provenance sous une réponse', () => {
  it('M8 · une réponse sans source montre son texte, sans « Faible — IA seule » ni « Savoir de l’IA »', () => {
    renderAnswer([]);

    expect(screen.getByText('Le Pont de Pierre a été achevé en 1822.')).toBeTruthy();
    expect(screen.queryByText('chat.citation.confidence.low')).toBeNull();
    expect(screen.queryByText('chat.citation.family.ai-knowledge')).toBeNull();
  });

  it('M8 · une réponse sourcée garde son renvoi de source, sans pastille de confiance ni de famille', () => {
    renderAnswer([makeCitationSource({ type: 'wikidata' })]);

    expect(screen.getByTestId('source-citation-marker')).toBeTruthy();
    expect(screen.queryByText('chat.citation.confidence.high')).toBeNull();
    expect(screen.queryByText('chat.citation.family.reference-db')).toBeNull();
  });
});
