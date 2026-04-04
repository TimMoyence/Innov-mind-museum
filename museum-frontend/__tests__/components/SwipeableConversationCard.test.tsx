import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Swipeable: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

import { SwipeableConversationCard } from '@/features/conversation/ui/SwipeableConversationCard';

describe('SwipeableConversationCard', () => {
  const onDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children content', () => {
    render(
      <SwipeableConversationCard onDelete={onDelete}>
        <Text>Conversation Title</Text>
      </SwipeableConversationCard>,
    );
    expect(screen.getByText('Conversation Title')).toBeTruthy();
  });

  it('renders children inside plain View when editMode is true', () => {
    render(
      <SwipeableConversationCard onDelete={onDelete} editMode>
        <Text>Edit Mode Content</Text>
      </SwipeableConversationCard>,
    );
    expect(screen.getByText('Edit Mode Content')).toBeTruthy();
  });

  it('renders children inside Swipeable when editMode is false', () => {
    render(
      <SwipeableConversationCard onDelete={onDelete} editMode={false}>
        <Text>Swipeable Content</Text>
      </SwipeableConversationCard>,
    );
    expect(screen.getByText('Swipeable Content')).toBeTruthy();
  });
});
