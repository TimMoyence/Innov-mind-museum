import { useRef, useSyncExternalStore, useCallback } from 'react';
import { OfflineQueue, QueuedMessage } from './offlineQueue';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';

export const useOfflineQueue = () => {
  const queueRef = useRef(new OfflineQueue());
  const { isConnected } = useConnectivity();

  const queue = queueRef.current;

  const snapshot = useSyncExternalStore(
    useCallback((cb: () => void) => queue.subscribe(cb), [queue]),
    () => queue.getAll(),
  );

  return {
    pendingMessages: snapshot,
    pendingCount: snapshot.length,
    isOffline: !isConnected,
    enqueue: useCallback(
      (msg: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>) => queue.enqueue(msg),
      [queue],
    ),
    dequeue: useCallback(() => queue.dequeue(), [queue]),
    remove: useCallback((id: string) => queue.remove(id), [queue]),
  };
};
