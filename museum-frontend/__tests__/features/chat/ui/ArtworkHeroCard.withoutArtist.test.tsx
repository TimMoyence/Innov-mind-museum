import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeArtworkHeroModel } from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';

import { ArtworkHeroCard } from '@/features/chat/ui/ArtworkHeroCard';

describe('Carte héros du chat — œuvre sans artiste connu', () => {
  it('AUDIT-2026-11-09 · le lecteur d’écran nomme l’œuvre sans « de , »', () => {
    speakAppLanguage('fr');

    render(<ArtworkHeroCard model={makeArtworkHeroModel({ artist: null })} onExpand={jest.fn()} />);

    expect(screen.getByText('La Joconde')).toBeTruthy();
    expect(screen.getByLabelText('Œuvre : La Joconde, toucher pour agrandir')).toBeTruthy();
  });

  it('AUDIT-2026-11-09 · avec un artiste, le libellé le nomme toujours', () => {
    speakAppLanguage('fr');

    render(<ArtworkHeroCard model={makeArtworkHeroModel()} onExpand={jest.fn()} />);

    expect(
      screen.getByLabelText('Œuvre : La Joconde de Léonard de Vinci, toucher pour agrandir'),
    ).toBeTruthy();
  });
});
