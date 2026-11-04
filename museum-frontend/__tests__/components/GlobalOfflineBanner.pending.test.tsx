import type React from 'react';
import { act, render } from '@testing-library/react-native';

import '../helpers/test-utils';

const fakeStore: Record<string, string> = {};
jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: jest.fn((key: string) => Promise.resolve(fakeStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      fakeStore[key] = value;
      return Promise.resolve();
    }),
  },
}));

jest.mock('@/shared/infrastructure/connectivity/useConnectivity', () => ({
  useConnectivity: () => ({ isConnected: false, isInternetReachable: false, isOnline: false }),
}));

jest.mock('@/features/chat/application/offlineImageStorage', () => ({
  persistOfflineImage: jest.fn((uri: string) => Promise.resolve(uri)),
  cleanupOfflineImage: jest.fn(),
  cleanupOfflineImages: jest.fn(),
}));

import { OfflineQueueProvider, useOfflineQueue } from '@/features/chat/application/useOfflineQueue';
import { GlobalOfflineBannerHost } from '@/shared/infrastructure/connectivity/GlobalOfflineBannerHost';

type Enqueue = ReturnType<typeof useOfflineQueue>['enqueue'];

const ChatScreenQueue: React.FC<{ onReady: (enqueue: Enqueue) => void }> = ({ onReady }) => {
  onReady(useOfflineQueue().enqueue);
  return null;
};

describe('GlobalOfflineBannerHost — messages queued offline', () => {
  it('shows the pending count of a message the chat screen queued while offline', async () => {
    let enqueue: Enqueue | undefined;
    const { getByTestId, findByText } = render(
      <OfflineQueueProvider>
        <GlobalOfflineBannerHost />
        <ChatScreenQueue
          onReady={(fn) => {
            enqueue = fn;
          }}
        />
      </OfflineQueueProvider>,
    );

    expect(getByTestId('offline-banner')).toBeTruthy();

    await act(async () => {
      await enqueue?.({ sessionId: 'session-1', text: 'Quelle est l’histoire de ce lieu ?' });
    });

    expect(await findByText(/offline\.pending/)).toBeTruthy();
  });
});
