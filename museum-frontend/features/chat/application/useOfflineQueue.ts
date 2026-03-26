import { useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import type { QueuedMessage } from './offlineQueue';
import { OfflineQueue } from './offlineQueue';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { storage } from '@/shared/infrastructure/storage';

export const useOfflineQueue = () => {
  const queueRef = useRef(new OfflineQueue(storage));
  const { isConnected } = useConnectivity();

  const queue = queueRef.current;

  useEffect(() => {
    void queue.hydrate();
  }, [queue]);

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
    peek: useCallback(() => queue.peek(), [queue]),
    remove: useCallback((id: string) => { queue.remove(id); }, [queue]),
  };
};
