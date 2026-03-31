import { useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import type { QueuedMessage } from './offlineQueue';
import { OfflineQueue } from './offlineQueue';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { storage } from '@/shared/infrastructure/storage';
import {
  persistOfflineImage,
  cleanupOfflineImage,
  cleanupOfflineImages,
} from './offlineImageStorage';

function handleEvictedMessages(messages: QueuedMessage[]): void {
  const uris = messages
    .map((m) => m.imageUri)
    .filter((uri): uri is string => typeof uri === 'string');
  cleanupOfflineImages(uris);
}

export const useOfflineQueue = () => {
  const queueRef = useRef(new OfflineQueue({ storage, onEvict: handleEvictedMessages }));
  const { isConnected } = useConnectivity();

  // eslint-disable-next-line react-hooks/refs -- stable singleton ref
  const queue = queueRef.current;

  useEffect(() => {
    void queue.hydrate();
  }, [queue]);

  const snapshot = useSyncExternalStore(
    useCallback((cb: () => void) => queue.subscribe(cb), [queue]),
    () => queue.getAll(),
  );

  const enqueue = useCallback(
    (msg: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>) => {
      let imageUri = msg.imageUri;
      if (imageUri) {
        try {
          imageUri = persistOfflineImage(imageUri);
        } catch {
          // If image persistence fails, enqueue without the image
          // rather than losing the entire message
          imageUri = undefined;
        }
      }
      return queue.enqueue({ ...msg, imageUri });
    },
    [queue],
  );

  const dequeue = useCallback(() => {
    const item = queue.dequeue();
    if (item?.imageUri) {
      cleanupOfflineImage(item.imageUri);
    }
    return item;
  }, [queue]);

  return {
    pendingMessages: snapshot,
    pendingCount: snapshot.length,
    isOffline: !isConnected,
    enqueue,
    dequeue,
    peek: useCallback(() => queue.peek(), [queue]),
    remove: useCallback(
      (id: string) => {
        const all = queue.getAll();
        const target = all.find((m) => m.id === id);
        if (target?.imageUri) {
          cleanupOfflineImage(target.imageUri);
        }
        queue.remove(id);
      },
      [queue],
    ),
  };
};
