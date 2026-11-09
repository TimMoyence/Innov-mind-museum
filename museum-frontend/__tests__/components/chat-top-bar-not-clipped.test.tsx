import '../helpers/test-utils';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { mockUseChatSession, defaultChatSession } from '../helpers/chat-screen.setup';
import { render, screen } from '../helpers/render-chat-screen';

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

type Rendered = ReturnType<typeof screen.getByTestId>;

interface Clip {
  testID: unknown;
  height: unknown;
  overflow: unknown;
}

const clipsAbove = (node: Rendered): Clip[] => {
  const clips: Clip[] = [];
  let current = node.parent;
  while (current) {
    const style = StyleSheet.flatten(current.props.style as StyleProp<ViewStyle>) as
      | ViewStyle
      | undefined;
    if (typeof style?.height === 'number' || style?.overflow === 'hidden') {
      clips.push({
        testID: current.props.testID,
        height: style.height,
        overflow: style.overflow,
      });
    }
    current = current.parent;
  }
  return clips;
};

describe('M7 · l’en-tête du chat n’est enfermé dans aucune hauteur figée', () => {
  beforeEach(() => {
    mockUseChatSession.mockReturnValue(defaultChatSession());
  });

  it('M7 · aucun conteneur de l’en-tête ne fige sa hauteur ni ne coupe ce qui dépasse', () => {
    render(<ChatSessionScreen />);

    const header = screen.getByTestId('chat-header');

    expect(header).toBeTruthy();
    expect(clipsAbove(header)).toEqual([]);
  });
});
