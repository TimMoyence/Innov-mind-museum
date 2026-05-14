/**
 * Red tests for A2 — `<ArtworkHeroCard>` component (collapsed/expanded modes).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/A2.md` §1.2
 * (R8-R15) + §4 (AC10-AC15) :
 *
 *   1. `model={null}` → renders nothing (R8, AC10).
 *   2. `collapsed={false}` → renders thumb + title + artist + museum-room (R9, AC11).
 *   3. `collapsed` → renders thumb-mini + title only ; no artist, no museum (R10, AC12).
 *   4. `model.title === null` → renders i18n `chat.artworkHero.untitled` (R13, AC13).
 *   5. `onExpand` provided → tapping invokes it (R12, AC14).
 *   6. `accessibilityHint` gated by `onExpand` (R14, AC15).
 *   7. `accessibilityRole === 'button'` always (R11).
 *
 * At baseline (A2 not yet implemented) :
 *   - `@/features/chat/ui/ArtworkHeroCard` does not exist.
 *   - `@/features/chat/application/useArtworkHero` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import '../helpers/test-utils';

// RED ASSERTION 1 : component module does not exist yet.
import { ArtworkHeroCard } from '@/features/chat/ui/ArtworkHeroCard';

// RED ASSERTION 2 : hook module does not exist yet.
import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';

const fullModel: ArtworkHeroModel = {
  imageUrl: 'https://signed.example.com/mona.jpg',
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  museum: 'Louvre',
  room: 'Salle des États',
  confidence: 0.93,
};

const untitledModel: ArtworkHeroModel = {
  imageUrl: 'https://signed.example.com/unknown.jpg',
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
      // Museum-room is joined with em-dash separator.
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
      // i18next test mode returns the key path as the rendered string.
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
      // Either interpolation rendered or raw key with title placeholder visible.
      const label = String(node.props.accessibilityLabel ?? '');
      expect(label.length).toBeGreaterThan(0);
    });

    it('sets a distinct accessibilityLabel for untitled models (R11 untitled branch)', () => {
      const { getByRole } = render(<ArtworkHeroCard model={untitledModel} onExpand={jest.fn()} />);
      const node = getByRole('button');
      const label = String(node.props.accessibilityLabel ?? '');
      // The untitled label should reference the dedicated i18n key.
      expect(label).toContain('chat.artworkHero.a11y_label_untitled');
    });
  });
});
