import '../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeListSessionsResponse } from '../../helpers/factories';
import { nonNull } from '../../helpers/nonNull';
import { speakAppLanguage } from '../../helpers/real-i18n';

import { buildVisitCarnetDetail } from '@/features/chat/application/chatSessionLogic.pure';
import { groupSessionsByMuseumAndDate } from '@/features/chat/domain/carnet';
import { CarnetSessionCard } from '@/features/chat/ui/CarnetSessionCard';

const unreadable = {
  ...nonNull(makeListSessionsResponse().sessions[0]),
  title: 'La Joconde',
  museumId: null,
  museumName: 'Louvre',
  updatedAt: 'NOT-A-DATE',
};

describe('Carnet — une date illisible ne s’affiche jamais brute', () => {
  it('AUDIT-2026-11-09 · la carte du carnet se lit « La Joconde, Louvre, ouvrir la visite »', () => {
    speakAppLanguage('fr');
    const group = nonNull(groupSessionsByMuseumAndDate([unreadable], 'fr')[0]);
    const card = nonNull(group.sessions[0]);

    render(<CarnetSessionCard card={card} onPress={jest.fn()} />);

    expect(screen.getByText('La Joconde')).toBeTruthy();
    expect(screen.getByLabelText('La Joconde, Louvre, ouvrir la visite')).toBeTruthy();
    expect(screen.queryByText(/NOT-A-DATE/)).toBeNull();
  });

  it('AUDIT-2026-11-09 · le détail du carnet n’a pas de date plutôt qu’une valeur brute', () => {
    const detail = buildVisitCarnetDetail(unreadable, [], 'fr');

    expect(detail.transcript).toEqual([]);
    expect(detail.dateLabel).toBeNull();
  });
});
