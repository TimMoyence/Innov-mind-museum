import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { ChatUiMessageMetadata } from '@/features/chat/application/chatSessionLogic.pure';
import { MessageActions } from '@/features/chat/ui/MessageActions';

jest.mock('@/features/chat/ui/FollowUpButtons', () => {
  const { Text, Pressable } = require('react-native');
  return {
    FollowUpButtons: ({
      questions,
      onPress,
    }: {
      questions: string[];
      onPress: (text: string) => void;
    }) => (
      <>
        {questions.map((q: string) => (
          <Pressable key={q} onPress={() => { onPress(q); }} testID={`followup-${q}`}>
            <Text>{q}</Text>
          </Pressable>
        ))}
      </>
    ),
  };
});

jest.mock('@/features/chat/ui/RecommendationChips', () => {
  const { Text, Pressable } = require('react-native');
  return {
    RecommendationChips: ({
      recommendations,
      onPress,
    }: {
      recommendations: string[];
      onPress: (text: string) => void;
    }) => (
      <>
        {recommendations.map((r: string) => (
          <Pressable key={r} onPress={() => { onPress(r); }} testID={`rec-${r}`}>
            <Text>{r}</Text>
          </Pressable>
        ))}
      </>
    ),
  };
});

describe('MessageActions', () => {
  const baseProps = {
    onFollowUpPress: jest.fn(),
    onRecommendationPress: jest.fn(),
    isSendingDisabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when metadata is null', () => {
    const { toJSON } = render(<MessageActions {...baseProps} metadata={null} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when metadata is undefined', () => {
    const { toJSON } = render(<MessageActions {...baseProps} metadata={undefined} />);
    expect(toJSON()).toBeNull();
  });

  it('renders follow-up buttons and fires onFollowUpPress', () => {
    const metadata: ChatUiMessageMetadata = {
      followUpQuestions: ['What year was it painted?'],
    };

    render(<MessageActions {...baseProps} metadata={metadata} />);
    const btn = screen.getByTestId('followup-What year was it painted?');
    fireEvent.press(btn);
    expect(baseProps.onFollowUpPress).toHaveBeenCalledWith('What year was it painted?');
  });

  it('renders recommendation chips and fires onRecommendationPress', () => {
    const metadata: ChatUiMessageMetadata = {
      recommendations: ['Baroque art'],
    };

    render(<MessageActions {...baseProps} metadata={metadata} />);
    const chip = screen.getByTestId('rec-Baroque art');
    fireEvent.press(chip);
    expect(baseProps.onRecommendationPress).toHaveBeenCalledWith('Baroque art');
  });

  it('renders deeper context toggle and expands on press', () => {
    const metadata: ChatUiMessageMetadata = {
      deeperContext: 'This painting was created in 1503.',
    };

    render(<MessageActions {...baseProps} metadata={metadata} />);

    expect(screen.getByText('messageActions.learn_more')).toBeTruthy();
    expect(screen.queryByText('This painting was created in 1503.')).toBeNull();

    fireEvent.press(screen.getByText('messageActions.learn_more'));
    expect(screen.getByText('This painting was created in 1503.')).toBeTruthy();
  });

  it('renders open question chip and fires onRecommendationPress', () => {
    const metadata: ChatUiMessageMetadata = {
      openQuestion: 'What else would you like to know?',
    };

    render(<MessageActions {...baseProps} metadata={metadata} />);
    const chip = screen.getByLabelText('What else would you like to know?');
    fireEvent.press(chip);
    expect(baseProps.onRecommendationPress).toHaveBeenCalledWith(
      'What else would you like to know?',
    );
  });

  it('does not fire open question press when sending is disabled', () => {
    const metadata: ChatUiMessageMetadata = {
      openQuestion: 'Ask me anything',
    };

    render(<MessageActions {...baseProps} metadata={metadata} isSendingDisabled />);
    const chip = screen.getByLabelText('Ask me anything');
    fireEvent.press(chip);
    expect(baseProps.onRecommendationPress).not.toHaveBeenCalled();
  });
});
