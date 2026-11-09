import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeReview } from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

import { ReviewCard } from '@/features/review/ui/ReviewCard';

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();

describe('Avis — un avis daté dans le futur', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    speakAppLanguage('fr');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BREAKER-2026-11-09 · une horloge en retard sur le serveur affiche « Aujourd’hui », jamais « -1 j »', () => {
    const tomorrow = new Date(NOW + 86_400_000).toISOString();

    render(<ReviewCard review={makeReview({ userName: 'Claire', createdAt: tomorrow })} />);

    expect(screen.getByText('Claire')).toBeTruthy();
    expect(screen.getByText("Aujourd'hui")).toBeTruthy();
    expect(screen.queryByText(/-\d/)).toBeNull();
  });
});
