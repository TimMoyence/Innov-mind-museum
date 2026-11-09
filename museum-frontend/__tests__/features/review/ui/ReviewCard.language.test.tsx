import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeReview } from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

import { ReviewCard } from '@/features/review/ui/ReviewCard';

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();
const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

describe('Avis — la date relative parle la langue de l’appli', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    speakAppLanguage('fr');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [0, "Aujourd'hui"],
    [1, 'Hier'],
    [5, '5 j'],
    [90, '3 mois'],
    [800, '2 ans'],
  ])('AUDIT-2026-11-09 · un avis vieux de %i jours se date « %s »', (days, expected) => {
    render(<ReviewCard review={makeReview({ userName: 'Claire', createdAt: daysAgo(days) })} />);

    expect(screen.getByText('Claire')).toBeTruthy();
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('AUDIT-2026-11-09 · en allemand, un avis du jour se date « Heute »', () => {
    speakAppLanguage('de');

    render(<ReviewCard review={makeReview({ userName: 'Claire', createdAt: daysAgo(0) })} />);

    expect(screen.getByText('Heute')).toBeTruthy();
  });
});
