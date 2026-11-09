import '../../../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { ChatSessionSurface } from '@/features/chat/ui/ChatSessionSurface';
import { SettingsAiConsentCard } from '@/features/settings/ui/SettingsAiConsentCard';

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { setMessageFeedback: jest.fn() },
}));

jest.mock('@/features/chat/infrastructure/consentApi', () => ({
  consentApi: {
    list: jest.fn().mockResolvedValue([]),
    grant: jest.fn(),
    revoke: jest.fn(),
  },
}));

jest.mock('@/features/chat/application/useAiConsent', () => ({
  clearConsentAcceptedFlag: jest.fn(),
}));

jest.mock('@/features/chat/ui/ChatMessageBubble', () => {
  const { View } = require('react-native');
  return {
    ChatMessageBubble: ({ message }: { message: { id: string } }) => (
      <View testID={`chat-bubble-${message.id}`} />
    ),
  };
});

jest.mock('@/features/chat/application/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    isPlaying: false,
    isLoading: false,
    activeMessageId: null,
    togglePlayback: jest.fn(),
    stopPlayback: jest.fn(),
  }),
}));

const MENTION = 'ai_disclosure.chat_footer';

const surfaceProps = {
  isLoading: false,
  isSending: false,
  isStreaming: false,
  locale: 'fr',
  onRecommendationPress: jest.fn(),
  onCamera: jest.fn(),
  onImageError: jest.fn(),
  onReport: jest.fn(),
  onLinkPress: jest.fn(() => false),
  isAssistantPending: false,
  currentPhase: null,
  surfaceStyle: undefined,
  skeletonStyle: undefined,
};

const userMessage: ChatUiMessage = {
  id: 'msg-1',
  role: 'user',
  text: 'Quel est l’âge du pont de pierre ?',
  createdAt: '2026-11-09T20:25:00.000Z',
  metadata: null,
};

describe('M11 · la mention IA apparaît une seule fois', () => {
  it('M11 · l’accueil d’une conversation vide porte la mention une fois', () => {
    render(<ChatSessionSurface {...surfaceProps} messages={[]} />);

    expect(screen.getByTestId('chat-empty-state')).toBeTruthy();
    expect(screen.getAllByText(MENTION)).toHaveLength(1);
  });

  it('M11 · une conversation commencée ne répète pas la mention sous le fil', () => {
    render(<ChatSessionSurface {...surfaceProps} messages={[userMessage]} />);

    expect(screen.getByTestId('chat-bubble-msg-1')).toBeTruthy();
    expect(screen.queryByText(MENTION)).toBeNull();
  });

  it('M11 · Paramètres porte la mention dans la carte des fournisseurs d’IA', async () => {
    render(<SettingsAiConsentCard />);

    await waitFor(() => {
      expect(screen.getByText('settings.ai_consent_title')).toBeTruthy();
    });
    expect(screen.getByText(MENTION)).toBeTruthy();
  });
});
