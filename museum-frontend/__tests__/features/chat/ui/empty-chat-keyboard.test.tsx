import '../../../helpers/test-utils';
import { Keyboard, StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { ChatMessageList } from '@/features/chat/ui/ChatMessageList';

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { setMessageFeedback: jest.fn() },
}));

jest.mock('@/features/chat/application/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    isPlaying: false,
    isLoading: false,
    activeMessageId: null,
    togglePlayback: jest.fn(),
    stopPlayback: jest.fn(),
  }),
}));

type KeyboardListener = () => void;

const listeners = new Map<string, KeyboardListener[]>();

const emitKeyboard = (event: string) => {
  act(() => {
    for (const listener of listeners.get(event) ?? []) listener();
  });
};

const listProps = {
  messages: [],
  isSending: false,
  isStreaming: false,
  locale: 'fr',
  onRecommendationPress: jest.fn(),
  onCamera: jest.fn(),
  onImageError: jest.fn(),
  onReport: jest.fn(),
};

describe('M12 · l’accueil vide reste utilisable clavier ouvert', () => {
  beforeEach(() => {
    listeners.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      const current = listeners.get(event) ?? [];
      listeners.set(event, [...current, listener as KeyboardListener]);
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('M12 · clavier ouvert, l’accueil garde « Ouvrir la caméra » et retire le grand pictogramme et le texte', () => {
    render(<ChatMessageList {...listProps} />);
    expect(screen.getByText('empty.chat.description')).toBeTruthy();

    emitKeyboard('keyboardWillShow');
    emitKeyboard('keyboardDidShow');

    expect(screen.getByText('empty.chat.actionLabel')).toBeTruthy();
    expect(screen.queryByText('empty.chat.description')).toBeNull();
    expect(screen.queryByText('chatbubble-ellipses-outline')).toBeNull();
  });

  it('M12 · le titre de l’accueil suit la couleur de texte du thème', () => {
    render(<ChatMessageList {...listProps} />);

    const title = StyleSheet.flatten(screen.getByText('empty.chat.title').props.style);

    expect(title.color).toBe('#0F172A');
  });
});
