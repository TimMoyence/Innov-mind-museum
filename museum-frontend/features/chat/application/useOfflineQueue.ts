import { useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import { Alert } from 'react-native';
import i18n from '@/shared/i18n/i18n';
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
  void cleanupOfflineImages(uris);
}

export const useOfflineQueue = () => {
  const queueRef = useRef(new OfflineQueue({ storage, onEvict: handleEvictedMessages }));
  // Source "offline" from the canonical predicate (design §D7) so a captive
  // portal ({isConnected:true, isInternetReachable:false}) reads as offline,
  // not the old `!isConnected` off a coerced value. lib-docs:
  // @react-native-community/netinfo PATTERNS.md:173 (reachable != connected).
  const { isOnline } = useConnectivity();

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
    async (msg: Omit<QueuedMessage, 'id' | 'createdAt' | 'retryCount'>) => {
      let imageUri = msg.imageUri;
      if (imageUri) {
        try {
          imageUri = await persistOfflineImage(imageUri);
        } catch {
          console.warn('[OfflineQueue] Image persistence failed, enqueueing without image');
          imageUri = undefined;
          Alert.alert(i18n.t('common.error'), i18n.t('chat.offlineImageFailed'));
        }
      }
      return queue.enqueue({ ...msg, imageUri });
    },
    [queue],
  );

  const dequeue = useCallback(() => {
    const item = queue.dequeue();
    if (item?.imageUri) {
      void cleanupOfflineImage(item.imageUri);
    }
    return item;
  }, [queue]);

  return {
    pendingMessages: snapshot,
    pendingCount: snapshot.length,
    isOffline: !isOnline,
    enqueue,
    dequeue,
    peek: useCallback(() => queue.peek(), [queue]),
    remove: useCallback(
      (id: string) => {
        const all = queue.getAll();
        const target = all.find((m) => m.id === id);
        if (target?.imageUri) {
          void cleanupOfflineImage(target.imageUri);
        }
        queue.remove(id);
      },
      [queue],
    ),
  };
};
