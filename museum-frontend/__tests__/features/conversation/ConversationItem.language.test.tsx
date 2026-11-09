import '../../helpers/test-utils';
import type React from 'react';
import { render, screen } from '@testing-library/react-native';

import { makeListSessionsResponse } from '../../helpers/factories';
import { nonNull } from '../../helpers/nonNull';
import { speakAppLanguage } from '../../helpers/real-i18n';

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import { mapSessionsToDashboardCards } from '@/features/chat';
import { ConversationItem } from '@/features/conversation/ui/ConversationItem';

type Session = ReturnType<typeof makeListSessionsResponse>['sessions'][number];

const base = nonNull(makeListSessionsResponse().sessions[0]);

const renderCard = (overrides: Partial<Session>) => {
  const card = nonNull(mapSessionsToDashboardCards([{ ...base, ...overrides }], 'fr')[0]);
  render(
    <ConversationItem
      item={card}
      editMode={false}
      selectedIds={new Set()}
      savedSessionIds={[]}
      toggleSelection={jest.fn()}
      toggleSavedSession={jest.fn()}
      confirmDeleteSingle={jest.fn()}
    />,
  );
};

describe('Écran Conversations — la carte parle la langue de l’appli', () => {
  beforeEach(() => {
    speakAppLanguage('fr');
  });

  it('DEC-2026-11-09 · le sous-titre ne montre que le musée', () => {
    renderCard({ title: 'La Joconde', museumName: 'Louvre', museumMode: true, locale: 'fr-FR' });

    expect(screen.getByText('La Joconde')).toBeTruthy();
    expect(screen.getByText('Louvre')).toBeTruthy();
    expect(screen.queryByText(/Guided mode|Standard mode|fr-FR/)).toBeNull();
  });

  it('AUDIT-2026-11-09 · une conversation vide se titre « Pas encore de message »', () => {
    renderCard({ title: null, preview: undefined, museumName: null });

    expect(screen.getByText('Pas encore de message')).toBeTruthy();
    expect(screen.queryByText('No messages yet')).toBeNull();
  });

  it('AUDIT-2026-11-09 · une date illisible ne laisse ni « Unknown time » ni valeur brute', () => {
    renderCard({ title: 'La Joconde', preview: undefined, updatedAt: 'NOT-A-DATE' });

    expect(screen.getByText('La Joconde')).toBeTruthy();
    expect(screen.queryByText(/Unknown time|NOT-A-DATE/)).toBeNull();
  });
});
