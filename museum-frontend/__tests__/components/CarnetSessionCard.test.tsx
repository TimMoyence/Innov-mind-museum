/**
 * Red tests for B1 — `<CarnetSessionCard>` component (visit notebook list item).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B1.md` :
 *
 *   §1.3 R18 — props shape { card, onPress }, React.memo with shallow compare.
 *   §1.3 R19 — accessibilityRole="button" + accessibilityLabel includes title/museum/date.
 *   §1.3 R20 — renders title, dateLabel, chevron-forward icon.
 *   §1.3 R21 — uses design tokens, NO raw color literals (verified by lint).
 *   §4 AC15 — a11y label invariant.
 *
 * At baseline (B1 not yet implemented) :
 *   - `@/features/chat/ui/CarnetSessionCard` does NOT exist
 *     (verified : `ls museum-frontend/features/chat/ui/CarnetSessionCard*` → 0).
 *   → Jest fails with "Cannot find module" at module load time.
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §1.3 R18-R22 ; §4 AC15.
 */

import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// RED ASSERTION — module DOES NOT EXIST at baseline.
import { CarnetSessionCard } from '@/features/chat/ui/CarnetSessionCard';
import type { VisitCarnetCard } from '@/features/chat/domain/carnet';

function makeCard(overrides: Partial<VisitCarnetCard> = {}): VisitCarnetCard {
  return {
    id: 'sess-1',
    title: 'La Joconde',
    museumLabel: 'Louvre',
    museumKey: 'museumId:12',
    dateLabel: '21 Apr 2026',
    rawUpdatedAt: '2026-04-21T12:00:00.000Z',
    messageCount: 5,
    lastArtworkTitle: 'La Joconde',
    ...overrides,
  };
}

describe('<CarnetSessionCard /> (B1 — list item component)', () => {
  it('renders the card title (R20)', () => {
    render(
      <CarnetSessionCard card={makeCard({ title: 'Visite Louvre samedi' })} onPress={jest.fn()} />,
    );
    expect(screen.getByText('Visite Louvre samedi')).toBeTruthy();
  });

  it('renders the card dateLabel (R20)', () => {
    render(<CarnetSessionCard card={makeCard({ dateLabel: '21 Apr 2026' })} onPress={jest.fn()} />);
    expect(screen.getByText('21 Apr 2026')).toBeTruthy();
  });

  it('has accessibilityRole="button" and accessibilityLabel including title/museum/date (R19, AC15)', () => {
    render(
      <CarnetSessionCard
        card={makeCard({ title: 'La Joconde', museumLabel: 'Louvre', dateLabel: '21 Apr 2026' })}
        onPress={jest.fn()}
      />,
    );

    const pressable = screen.getByRole('button');
    expect(pressable).toBeTruthy();
    const label = String(pressable.props.accessibilityLabel ?? '');
    expect(label).toContain('La Joconde');
    expect(label).toContain('Louvre');
    expect(label).toContain('21 Apr 2026');
  });

  it('calls onPress with the card id when tapped (R18)', () => {
    const onPress = jest.fn();
    render(<CarnetSessionCard card={makeCard({ id: 'sess-9' })} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('sess-9');
  });

  it('renders a trailing chevron Ionicon (R20)', () => {
    render(<CarnetSessionCard card={makeCard()} onPress={jest.fn()} />);
    // Ionicons are mocked in test-utils — they render a Text node with the icon name.
    // The component should include `name="chevron-forward"` in its tree.
    expect(screen.queryByText('chevron-forward')).toBeTruthy();
  });
});
