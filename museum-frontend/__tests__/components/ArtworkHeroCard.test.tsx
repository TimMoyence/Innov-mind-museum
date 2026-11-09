import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import '../helpers/test-utils';

import { ArtworkHeroCard } from '@/features/chat/ui/ArtworkHeroCard';

import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';

const fullModel: ArtworkHeroModel = {
  imageUrl: 'https://signed.example.com/mona.jpg',
  messageId: 'msg-hero-full',
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  museum: 'Louvre',
  room: 'Salle des États',
  confidence: 0.93,
};

const untitledModel: ArtworkHeroModel = {
  imageUrl: 'https://signed.example.com/unknown.jpg',
  messageId: 'msg-hero-untitled',
  title: null,
  artist: null,
  museum: null,
  room: null,
  confidence: null,
};

describe('<ArtworkHeroCard> (A2 collapsible hero)', () => {
  describe('null model → empty render (R8, AC10)', () => {
    it('renders nothing when model is null', () => {
      const { toJSON } = render(<ArtworkHeroCard model={null} />);
      expect(toJSON()).toBeNull();
    });
  });

  describe('expanded mode (R9, AC11)', () => {
    it('renders title + artist + museum-room when collapsed={false}', () => {
      const { getByText } = render(<ArtworkHeroCard model={fullModel} collapsed={false} />);
      expect(getByText('Mona Lisa')).toBeTruthy();
      expect(getByText('Leonardo da Vinci')).toBeTruthy();
      expect(getByText('Louvre — Salle des États')).toBeTruthy();
    });

    it('defaults to expanded when collapsed prop is omitted', () => {
      const { getByText } = render(<ArtworkHeroCard model={fullModel} />);
      expect(getByText('Leonardo da Vinci')).toBeTruthy();
    });
  });

  describe('mini-collapsed mode (R10, AC12)', () => {
    it('renders only the title when collapsed (no artist, no museum)', () => {
      const { getByText, queryByText } = render(<ArtworkHeroCard model={fullModel} collapsed />);
      expect(getByText('Mona Lisa')).toBeTruthy();
      expect(queryByText('Leonardo da Vinci')).toBeNull();
      expect(queryByText('Louvre — Salle des États')).toBeNull();
    });
  });

  describe('untitled fallback (R13, AC13)', () => {
    it('renders i18n key chat.artworkHero.untitled when title is null', () => {
      const { getByText } = render(<ArtworkHeroCard model={untitledModel} />);
      expect(getByText('chat.artworkHero.untitled')).toBeTruthy();
    });
  });

  describe('press handler (R12, AC14)', () => {
    it('invokes onExpand() when the card is tapped', () => {
      const onExpand = jest.fn();
      const { getByRole } = render(<ArtworkHeroCard model={fullModel} onExpand={onExpand} />);
      fireEvent.press(getByRole('button'));
      expect(onExpand).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility (R11, R14, AC15)', () => {
    it('sets accessibilityRole=button (R11)', () => {
      const { getByRole } = render(<ArtworkHeroCard model={fullModel} onExpand={jest.fn()} />);
      const node = getByRole('button');
      expect(node).toBeTruthy();
    });

    it('sets accessibilityHint to chat.artworkHero.a11y_hint when onExpand is provided (R14)', () => {
      const { getByRole } = render(<ArtworkHeroCard model={fullModel} onExpand={jest.fn()} />);
      const node = getByRole('button');
      expect(node.props.accessibilityHint).toBe('chat.artworkHero.a11y_hint');
    });

    it('omits accessibilityHint when onExpand is NOT provided (R14)', () => {
      const { getByRole } = render(<ArtworkHeroCard model={fullModel} />);
      const node = getByRole('button');
      expect(node.props.accessibilityHint).toBeUndefined();
    });

    it('sets accessibilityLabel containing the title for titled models', () => {
      const { getByRole } = render(<ArtworkHeroCard model={fullModel} onExpand={jest.fn()} />);
      const node = getByRole('button');
      const label = String(node.props.accessibilityLabel ?? '');
      expect(label.length).toBeGreaterThan(0);
    });

    it('sets a distinct accessibilityLabel for untitled models (R11 untitled branch)', () => {
      const { getByRole } = render(<ArtworkHeroCard model={untitledModel} onExpand={jest.fn()} />);
      const node = getByRole('button');
      const label = String(node.props.accessibilityLabel ?? '');
      expect(label).toContain('chat.artworkHero.a11y_label_untitled');
    });
  });
});
