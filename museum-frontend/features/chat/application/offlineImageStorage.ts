import { File, Directory, Paths } from 'expo-file-system';

const OFFLINE_IMAGE_DIR_NAME = 'offline-images';

function getOfflineImageDir(): Directory {
  return new Directory(Paths.document, OFFLINE_IMAGE_DIR_NAME);
}

/**
 * Copies a temporary image URI to a persistent location in the document directory.
 * Returns the persistent URI that survives app restarts.
 */
export function persistOfflineImage(tempUri: string): string {
  const dir = getOfflineImageDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  const filename = `img-${String(Date.now())}-${Math.random().toString(36).slice(2)}.jpg`;
  const source = new File(tempUri);
  const destination = new File(dir, filename);

  source.copy(destination);
  return destination.uri;
}

/**
 * Checks whether the given URI points to the offline-images persistent directory.
 */
export function isPersistedOfflineImage(uri: string): boolean {
  const dir = getOfflineImageDir();
  return uri.startsWith(dir.uri);
}

/**
 * Deletes a persisted offline image if it exists in the offline-images directory.
 * Silently ignores errors (e.g. file already deleted, not a persisted image).
 */
export function cleanupOfflineImage(uri: string): void {
  if (!isPersistedOfflineImage(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cleanup is best-effort — ignore failures
  }
}

/**
 * Deletes multiple persisted offline images.
 */
export function cleanupOfflineImages(uris: string[]): void {
  for (const uri of uris) {
    cleanupOfflineImage(uri);
  }
}
