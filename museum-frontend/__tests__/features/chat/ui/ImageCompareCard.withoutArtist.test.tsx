import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeArtworkFacts, makeCompareMatch } from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

import { ImageCompareCard } from '@/features/chat/ui/ImageCompareCard';

const nympheas = makeCompareMatch({
  facts: makeArtworkFacts({ qid: 'Q3415174', title: 'Water Lilies', artist: undefined }),
  title: 'Water Lilies',
  rationale: 'Same palette.',
});

describe('Similar artwork card — artwork with no known artist', () => {
  it('BREAKER-2026-11-09 · the English label names the title alone', () => {
    speakAppLanguage('en');
    render(<ImageCompareCard match={nympheas} onPress={jest.fn()} />);

    expect(screen.getByLabelText('Similar artwork: Water Lilies, Same palette.')).toBeTruthy();
    expect(screen.getByText('Water Lilies')).toBeTruthy();
  });
});
