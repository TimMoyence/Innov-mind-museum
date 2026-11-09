import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { VisitCarnetGroup } from '@/features/chat/domain/carnet';

const mockUseVisitCarnet = jest.fn();
jest.mock(
  '@/features/chat/application/useVisitCarnet',
  () => ({
    useVisitCarnet: () => mockUseVisitCarnet(),
  }),
  { virtual: true },
);

const mockCardRender = jest.fn();
jest.mock(
  '@/features/chat/ui/CarnetSessionCard',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      CarnetSessionCard: (props: {
        card: { id: string; title: string };
        onPress: (id: string) => void;
      }) => {
        mockCardRender(props);
        return ReactNS.createElement(
          RN.Pressable,
          {
            testID: `mock-CarnetSessionCard-${props.card.id}`,
            accessibilityRole: 'button',
            onPress: () => {
              props.onPress(props.card.id);
            },
          },
          ReactNS.createElement(RN.Text, null, props.card.title),
        );
      },
    };
  },
  { virtual: true },
);

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

const mockStartConversation = jest.fn();
jest.mock('@/features/chat/application/useStartConversation', () => ({
  useStartConversation: () => ({
    isCreating: false,
    error: null,
    startConversation: mockStartConversation,
  }),
}));

import CarnetListScreen from '@/app/(stack)/carnet';

function makeGroup(
  museumLabel: string,
  sessions: { id: string; title: string }[],
): VisitCarnetGroup {
  return {
    museumKey: `museumName:${museumLabel}`,
    museumLabel,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      museumLabel,
      museumKey: `museumName:${museumLabel}`,
      dateLabel: '21 Apr 2026',
      rawUpdatedAt: '2026-04-21T12:00:00.000Z',
      messageCount: 4,
      lastArtworkTitle: s.title,
    })),
  };
}

describe('<CarnetListScreen /> (B1 — list screen)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders skeleton placeholders while loading (R14, AC4)', () => {
    mockUseVisitCarnet.mockReturnValue({
      isLoading: true,
      error: null,
      groups: [],
      refresh: jest.fn(),
    });

    render(<CarnetListScreen />);
    const skeletons = screen.queryAllByTestId('skeleton-card');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when not loading and no groups (R12, AC5)', () => {
    mockUseVisitCarnet.mockReturnValue({
      isLoading: false,
      error: null,
      groups: [],
      refresh: jest.fn(),
    });

    render(<CarnetListScreen />);
    expect(screen.getByText('carnet.empty.title')).toBeTruthy();
  });

  it('renders error state when error is non-null (R15, AC6)', () => {
    mockUseVisitCarnet.mockReturnValue({
      isLoading: false,
      error: 'Network down',
      groups: [],
      refresh: jest.fn(),
    });

    render(<CarnetListScreen />);
    expect(screen.getByText('Network down')).toBeTruthy();
  });

  it('renders groups with museumLabel headers (R11)', () => {
    mockUseVisitCarnet.mockReturnValue({
      isLoading: false,
      error: null,
      groups: [
        makeGroup('Louvre', [
          { id: 's1', title: 'La Joconde' },
          { id: 's2', title: 'Le Radeau' },
        ]),
        makeGroup('Orsay', [{ id: 's3', title: 'Olympia' }]),
      ],
      refresh: jest.fn(),
    });

    render(<CarnetListScreen />);
    expect(screen.getByText('Louvre')).toBeTruthy();
    expect(screen.getByText('Orsay')).toBeTruthy();
    expect(mockCardRender).toHaveBeenCalledTimes(3);
  });

  it('navigates to /(stack)/carnet/${id} on card tap (R13, AC7)', () => {
    mockUseVisitCarnet.mockReturnValue({
      isLoading: false,
      error: null,
      groups: [makeGroup('Louvre', [{ id: 'sess-9', title: 'La Joconde' }])],
      refresh: jest.fn(),
    });

    render(<CarnetListScreen />);
    fireEvent.press(screen.getByTestId('mock-CarnetSessionCard-sess-9'));
    expect(router.push).toHaveBeenCalledWith('/(stack)/carnet/sess-9');
  });
});
