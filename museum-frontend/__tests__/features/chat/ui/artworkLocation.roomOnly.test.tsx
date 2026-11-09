import '../../../helpers/test-utils';
import type React from 'react';
import { render, screen } from '@testing-library/react-native';

import { makeArtworkHeroModel } from '../../../helpers/factories';

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Gesture: { Pinch: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';
import { ArtworkHeroCard } from '@/features/chat/ui/ArtworkHeroCard';
import { ArtworkHeroModal } from '@/features/chat/ui/ArtworkHeroModal';

const roomOnly = makeArtworkHeroModel({ museum: null, room: 'Salle 711' });

describe('Ligne de lieu — la salle s’affiche même sans musée', () => {
  it('DEC-2026-11-09 · la carte héros montre « Salle 711 »', () => {
    render(<ArtworkHeroCard model={roomOnly} />);

    expect(screen.getByText('La Joconde')).toBeTruthy();
    expect(screen.getByText('Salle 711')).toBeTruthy();
  });

  it('DEC-2026-11-09 · la vue agrandie montre « Salle 711 »', () => {
    render(<ArtworkHeroModal visible model={roomOnly} onClose={jest.fn()} />);

    expect(screen.getByText('Salle 711')).toBeTruthy();
  });

  it('DEC-2026-11-09 · la carte « œuvre détectée » suit la même règle', () => {
    render(<ArtworkCard title="La Joconde" room="Salle 711" />);

    expect(screen.getByText('Salle 711')).toBeTruthy();
  });

  it('DEC-2026-11-09 · musée et salle connus se lisent « Louvre — Salle 711 » partout', () => {
    render(<ArtworkHeroCard model={makeArtworkHeroModel()} />);

    expect(screen.getByText('Louvre — Salle 711')).toBeTruthy();
  });
});
