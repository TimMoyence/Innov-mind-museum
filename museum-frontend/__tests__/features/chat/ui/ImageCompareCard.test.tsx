import '../../../helpers/test-utils';
import type { ComponentType } from 'react';
import { Image } from 'expo-image';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { components } from '@/shared/api/generated/openapi';

import {
  makeArtworkFacts,
  makeCompareMatch,
  makeCompareMatchCcBySa,
} from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

type CompareMatch = components['schemas']['CompareMatch'];

interface ImageCompareCardProps {
  match: CompareMatch;
  onPress: (qid: string) => void;
}

type ImageCompareCardComponent = ComponentType<ImageCompareCardProps>;

const loadComponent = (): ImageCompareCardComponent => {
  const mod = require('@/features/chat/ui/ImageCompareCard') as {
    ImageCompareCard: ImageCompareCardComponent;
  };
  return mod.ImageCompareCard;
};

describe('ImageCompareCard (T8.2)', () => {
  it('renders the thumbnail with the imageUrl from the match', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({ imageUrl: 'https://w.example.org/dance.jpg' });

    const { UNSAFE_getAllByType } = render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    const images = UNSAFE_getAllByType(Image);
    expect(images.length).toBeGreaterThanOrEqual(1);
    const sources = images.map((img) => (img.props as { source?: { uri?: string } }).source);
    expect(sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ uri: 'https://w.example.org/dance.jpg' })]),
    );
  });

  it('renders the title, artist and rationale text', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({
      facts: makeArtworkFacts({ title: 'La Danse', artist: 'Henri Matisse' }),
      title: 'La Danse',
      rationale: 'Composition cyclique et palette froide.',
    });

    render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    expect(screen.queryByText('La Danse')).toBeTruthy();
    expect(screen.queryByText(/Henri Matisse/)).toBeTruthy();
    expect(screen.queryByText('Composition cyclique et palette froide.')).toBeTruthy();
  });

  it('exposes an accessibilityLabel matching D5 template in French', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({
      facts: makeArtworkFacts({ title: 'La Danse', artist: 'Henri Matisse' }),
      title: 'La Danse',
      rationale: 'Composition cyclique.',
    });

    speakAppLanguage('fr');
    render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    const node = screen.getByLabelText(
      'Œuvre similaire : La Danse, Henri Matisse, Composition cyclique.',
    );
    expect(node).toBeTruthy();
  });

  it('exposes an accessibilityLabel matching D5 template in English', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({
      facts: makeArtworkFacts({ title: 'The Dance', artist: 'Henri Matisse' }),
      title: 'The Dance',
      rationale: 'Cyclical composition.',
    });

    speakAppLanguage('en');
    render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    const node = screen.getByLabelText(
      'Similar artwork: The Dance, Henri Matisse, Cyclical composition.',
    );
    expect(node).toBeTruthy();
  });

  it('uses a touch target of at least 44×44pt (WCAG 2.5.5)', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({ title: 'La Danse' });

    speakAppLanguage('fr');
    render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    const pressable = screen.getByLabelText(/Œuvre similaire/);
    interface FlexStyle {
      minWidth?: number;
      minHeight?: number;
      width?: number;
      height?: number;
    }
    interface HitSlop {
      left?: number;
      right?: number;
      top?: number;
      bottom?: number;
    }
    const props = pressable.props as {
      style?: FlexStyle | (FlexStyle | false | null)[];
      hitSlop?: HitSlop;
    };
    const flatStyle: FlexStyle = Array.isArray(props.style)
      ? Object.assign({}, ...props.style.filter((s): s is FlexStyle => Boolean(s)))
      : (props.style ?? {});
    const minWidth = flatStyle.minWidth ?? flatStyle.width ?? 0;
    const minHeight = flatStyle.minHeight ?? flatStyle.height ?? 0;
    const hitSlopWidth = (props.hitSlop?.left ?? 0) + (props.hitSlop?.right ?? 0);
    const hitSlopHeight = (props.hitSlop?.top ?? 0) + (props.hitSlop?.bottom ?? 0);

    expect(minWidth + hitSlopWidth).toBeGreaterThanOrEqual(44);
    expect(minHeight + hitSlopHeight).toBeGreaterThanOrEqual(44);
  });

  it('fires onPress(qid) when the card is pressed', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({ qid: 'Q12345' });
    const onPress = jest.fn();

    speakAppLanguage('fr');
    render(<ImageCompareCard match={match} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText(/Œuvre similaire/));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('Q12345');
  });

  it('does NOT render attribution text for matches without `attribution`', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({ attribution: undefined });

    render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    expect(screen.queryByText('chat.compare.attribution')).toBeNull();
  });

  it('renders the attribution text only when license is cc-by-sa (attribution present)', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatchCcBySa({
      attribution: 'Photo by W. Author / CC-BY-SA 4.0',
    });

    render(<ImageCompareCard match={match} onPress={jest.fn()} />);

    expect(screen.queryByText(/CC-BY-SA 4\.0/)).toBeTruthy();
  });

  it('matches the structural snapshot for a typical PD match', () => {
    const ImageCompareCard = loadComponent();
    const match = makeCompareMatch({
      qid: 'Q1234',
      title: 'La Danse',
      facts: makeArtworkFacts({ qid: 'Q1234', title: 'La Danse', artist: 'Henri Matisse' }),
      imageUrl: 'https://example.com/dance.jpg',
      thumbnailUrl: 'https://example.com/dance.thumb.jpg',
      rationale: 'Composition cyclique.',
      visualScore: 0.84,
      metadataScore: 0.62,
      finalScore: 0.78,
    });

    speakAppLanguage('fr');
    const { toJSON } = render(<ImageCompareCard match={match} onPress={jest.fn()} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
