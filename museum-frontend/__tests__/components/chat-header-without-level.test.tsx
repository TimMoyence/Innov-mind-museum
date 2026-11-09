import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { ChatHeader } from '@/features/chat/ui/ChatHeader';

describe('M6 · l’en-tête du chat ne montre pas de niveau', () => {
  it('M6 · même quand la dernière réponse signale un niveau, l’en-tête montre le titre sans pastille', () => {
    const headerFromScreen = {
      sessionTitle: 'Session artistique',
      isClosing: false,
      onClose: jest.fn(),
      expertiseLevel: 'beginner' as const,
    };

    render(<ChatHeader {...headerFromScreen} />);

    expect(screen.getByText('Session artistique')).toBeTruthy();
    expect(screen.queryByText('guideLevel.beginner')).toBeNull();
  });
});
