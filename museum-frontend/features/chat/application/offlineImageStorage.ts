import * as FileSystem from 'expo-file-system';

const OFFLINE_IMAGE_DIR_NAME = 'offline-images';

function getOfflineImageDirUri(): string {
  return `${FileSystem.documentDirectory}${OFFLINE_IMAGE_DIR_NAME}/`;
}

/**
 * Copies a temporary image URI to a persistent location in the document directory.
 * Returns the persistent URI that survives app restarts.
 */
export async function persistOfflineImage(tempUri: string): Promise<string> {
  const dirUri = getOfflineImageDirUri();
  const dirInfo = await FileSystem.getInfoAsync(dirUri);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }

  const filename = `img-${String(Date.now())}-${Math.random().toString(36).slice(2)}.jpg`;
  const destination = `${dirUri}${filename}`;

  await FileSystem.copyAsync({ from: tempUri, to: destination });
  return destination;
}

/**
 * Checks whether the given URI points to the offline-images persistent directory.
 */
export function isPersistedOfflineImage(uri: string): boolean {
  return uri.startsWith(getOfflineImageDirUri());
}

/**
 * Deletes a persisted offline image if it exists in the offline-images directory.
 * Silently ignores errors (e.g. file already deleted, not a persisted image).
 */
export async function cleanupOfflineImage(uri: string): Promise<void> {
  if (!isPersistedOfflineImage(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Cleanup is best-effort — ignore failures
  }
}

/**
 * Deletes multiple persisted offline images.
 */
export async function cleanupOfflineImages(uris: string[]): Promise<void> {
  await Promise.all(uris.map((uri) => cleanupOfflineImage(uri)));
}
