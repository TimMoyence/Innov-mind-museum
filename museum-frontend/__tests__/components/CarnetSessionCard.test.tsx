import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CarnetSessionCard } from '@/features/chat/ui/CarnetSessionCard';
import type { VisitCarnetCard } from '@/features/chat/domain/carnet';

import { speakAppLanguage } from '../helpers/real-i18n';

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
    speakAppLanguage('fr');
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
    expect(screen.queryByText('chevron-forward')).toBeTruthy();
  });
});
