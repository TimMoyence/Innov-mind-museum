/**
 * RED tests for `ImageCompareCarousel` (T8.4, Phase 8 — C3 Image Comparative).
 *
 * SUT: `museum-frontend/features/chat/ui/ImageCompareCarousel.tsx` —
 * a horizontal FlatList of `ImageCompareCard`s, with a localized header,
 * an explicit empty state, and propagation of the per-card press handler.
 *
 * Distinct file from `ImageCarousel.tsx` (D7 design — see design.md §D7).
 *
 * Component does not exist yet — these tests must FAIL on import.
 */
import '../../../helpers/test-utils';
import fs from 'fs';
import path from 'path';
import type { ComponentType } from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { components } from '@/shared/api/generated/openapi';

import { makeArtworkFacts, makeCompareMatch } from '../../../helpers/factories';

type CompareMatch = components['schemas']['CompareMatch'];

interface ImageCompareCarouselProps {
  matches: CompareMatch[];
  locale: 'fr' | 'en';
  onMatchPress: (qid: string) => void;
}

type ImageCompareCarouselComponent = ComponentType<ImageCompareCarouselProps>;

// Mock the inner card so we can isolate carousel behaviour and assert the
// import-target indirectly (D7 — distinct from `ImageCarousel`).
jest.mock('@/features/chat/ui/ImageCompareCard', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ImageCompareCard: ({
      match,
      onPress,
    }: {
      match: { qid: string; title: string };
      onPress: (qid: string) => void;
    }) => (
      <Pressable
        accessibilityLabel={`mock-card-${match.qid}`}
        onPress={() => {
          onPress(match.qid);
        }}
        testID={`mock-card-${match.qid}`}
      >
        <View>
          <Text>{match.title}</Text>
        </View>
      </Pressable>
    ),
  };
});

const loadComponent = (): ImageCompareCarouselComponent => {
  // Lazy require so a missing-SUT failure mode surfaces as a clean per-test
  // "Cannot find module" rather than a top-level import crash.
  const mod = require('@/features/chat/ui/ImageCompareCarousel') as {
    ImageCompareCarousel: ImageCompareCarouselComponent;
  };
  return mod.ImageCompareCarousel;
};

describe('ImageCompareCarousel (T8.4)', () => {
  it('renders the localized header text in French', () => {
    const ImageCompareCarousel = loadComponent();
    const matches = [makeCompareMatch()];

    render(<ImageCompareCarousel matches={matches} locale="fr" onMatchPress={jest.fn()} />);

    // test-utils mocks useTranslation to return key as-is; the actual header
    // must be rendered via the i18n key `chat.compare.title` (T8.6).
    expect(screen.queryByText('chat.compare.title')).toBeTruthy();
  });

  it('renders the localized empty state when matches is empty', () => {
    const ImageCompareCarousel = loadComponent();

    render(<ImageCompareCarousel matches={[]} locale="fr" onMatchPress={jest.fn()} />);

    // Explicit empty card per spec.md Q7 default = (b).
    expect(screen.queryByText('chat.compare.empty')).toBeTruthy();
    // No cards in the empty state.
    expect(screen.queryAllByLabelText(/mock-card-/)).toHaveLength(0);
  });

  it('renders exactly 1 ImageCompareCard for 1 match', () => {
    const ImageCompareCarousel = loadComponent();
    const matches = [
      makeCompareMatch({ qid: 'Q1', facts: makeArtworkFacts({ qid: 'Q1', title: 'Solo' }) }),
    ];

    render(<ImageCompareCarousel matches={matches} locale="fr" onMatchPress={jest.fn()} />);

    expect(screen.queryAllByLabelText(/^mock-card-/)).toHaveLength(1);
    expect(screen.queryByLabelText('mock-card-Q1')).toBeTruthy();
  });

  it('renders 5 cards when given 5 matches', () => {
    const ImageCompareCarousel = loadComponent();
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeCompareMatch({
        qid: `Q${i + 100}`,
        facts: makeArtworkFacts({ qid: `Q${i + 100}`, title: `Item ${i}` }),
      }),
    );

    render(<ImageCompareCarousel matches={matches} locale="fr" onMatchPress={jest.fn()} />);

    expect(screen.queryAllByLabelText(/^mock-card-/)).toHaveLength(5);
  });

  it('renders the carousel inside a horizontal FlatList', () => {
    const ImageCompareCarousel = loadComponent();
    const matches = [makeCompareMatch({ qid: 'Q1' })];

    const tree = render(
      <ImageCompareCarousel matches={matches} locale="fr" onMatchPress={jest.fn()} />,
    );

    const lists = tree.UNSAFE_getAllByType(FlatList);
    expect(lists.length).toBeGreaterThanOrEqual(1);
    const horizontal = lists.find(
      (l) => (l.props as { horizontal?: boolean }).horizontal === true,
    );
    expect(horizontal).toBeTruthy();
  });

  it('propagates onMatchPress(qid) when a card is pressed', () => {
    const ImageCompareCarousel = loadComponent();
    const onMatchPress = jest.fn();
    const matches = [
      makeCompareMatch({
        qid: 'Q42',
        facts: makeArtworkFacts({ qid: 'Q42', title: 'Press me' }),
      }),
    ];

    render(<ImageCompareCarousel matches={matches} locale="fr" onMatchPress={onMatchPress} />);

    fireEvent.press(screen.getByLabelText('mock-card-Q42'));

    expect(onMatchPress).toHaveBeenCalledTimes(1);
    expect(onMatchPress).toHaveBeenCalledWith('Q42');
  });

  it('imports `ImageCompareCard` (D7 — distinct file from ImageCarousel)', () => {
    const sutPath = path.resolve(
      __dirname,
      '../../../../features/chat/ui/ImageCompareCarousel.tsx',
    );
    expect(fs.existsSync(sutPath)).toBe(true);
    const source = fs.readFileSync(sutPath, 'utf8');

    // D7 contract: must use the dedicated card, NEVER the C2 ImageCarousel.
    expect(source).toMatch(/from\s+['"]\.\/ImageCompareCard['"]/);
    expect(source).not.toMatch(/from\s+['"]\.\/ImageCarousel['"]/);
  });

  it('matches the structural snapshot for 2 matches', () => {
    const ImageCompareCarousel = loadComponent();
    const matches = [
      makeCompareMatch({
        qid: 'Q1',
        facts: makeArtworkFacts({ qid: 'Q1', title: 'A' }),
      }),
      makeCompareMatch({
        qid: 'Q2',
        facts: makeArtworkFacts({ qid: 'Q2', title: 'B' }),
      }),
    ];

    const { toJSON } = render(
      <ImageCompareCarousel matches={matches} locale="fr" onMatchPress={jest.fn()} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
