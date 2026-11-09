import '../helpers/test-utils';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';

import { makeGetSessionResponse } from '../helpers/factories';
import { speakAppLanguage } from '../helpers/real-i18n';

const mockGetSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { getSession: (...args: unknown[]) => mockGetSession(...args) },
}));

const mockExpoRouter = jest.requireMock<Record<string, unknown>>('expo-router');
mockExpoRouter.useLocalSearchParams = () => ({ sessionId: 'session-carnet' });

import CarnetDetailScreen from '@/app/(stack)/carnet/[sessionId]';

describe('Détail du carnet — une date illisible ne laisse pas de ligne vide', () => {
  it('AUDIT-2026-11-09 · l’en-tête ne garde aucun texte vide', async () => {
    const response = makeGetSessionResponse();
    mockGetSession.mockResolvedValue({
      ...response,
      session: { ...response.session, title: 'Louvre', updatedAt: 'NOT-A-DATE' },
    });

    render(<CarnetDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Louvre')).toBeTruthy();
    });
    const emptyTexts = screen
      .UNSAFE_getAllByType(Text)
      .filter((node) => node.props.children === null || node.props.children === undefined);
    expect(emptyTexts).toHaveLength(0);
  });

  it('AUDIT-2026-11-09 · une date lisible garde sa ligne « 21 avr. 2026 »', async () => {
    speakAppLanguage('fr');
    const response = makeGetSessionResponse();
    mockGetSession.mockResolvedValue({
      ...response,
      session: { ...response.session, title: 'Louvre', updatedAt: '2026-04-21T12:00:00.000Z' },
    });

    render(<CarnetDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Louvre')).toBeTruthy();
    });
    expect(screen.getByText('21 avr. 2026')).toBeTruthy();
  });
});
