import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeArtworkFacts, makeCompareMatch } from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

import { ImageCompareCarousel } from '@/features/chat/ui/ImageCompareCarousel';

const tanz = makeCompareMatch({
  facts: makeArtworkFacts({ qid: 'Q1050580', title: 'Der Tanz', artist: 'Henri Matisse' }),
  title: 'Der Tanz',
  rationale: 'Gleiche Komposition.',
});

describe('Œuvres similaires — la carte parle la langue de l’appli', () => {
  it('AUDIT-2026-11-09 · en allemand, le lecteur d’écran annonce « Ähnliches Werk: … »', () => {
    speakAppLanguage('de');

    render(<ImageCompareCarousel matches={[tanz]} onMatchPress={jest.fn()} />);

    expect(screen.getByText('Der Tanz')).toBeTruthy();
    expect(
      screen.getByLabelText('Ähnliches Werk: Der Tanz, Henri Matisse, Gleiche Komposition.'),
    ).toBeTruthy();
  });
});
