import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { MessageActions } from '@/features/chat/ui/MessageActions';

describe('M9 · aucune relance automatique sous une réponse', () => {
  it('M9 · une réponse ancienne qui portait une relance ne l’affiche plus, les pistes restent', () => {
    const storedMetadata = {
      suggestedFollowUp: 'Who designed the Pont de Pierre?',
      recommendations: ['Bory et les ponts de Bordeaux'],
    };

    render(
      <MessageActions
        metadata={storedMetadata}
        onRecommendationPress={jest.fn()}
        isSendingDisabled={false}
      />,
    );

    expect(screen.getByText('Bory et les ponts de Bordeaux')).toBeTruthy();
    expect(screen.queryByText('Who designed the Pont de Pierre?')).toBeNull();
  });
});
