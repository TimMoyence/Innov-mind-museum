import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { SaveImageInput, ImageStorage } from '../../domain/ports/image-storage.port';

// Re-export domain port types so existing consumers that imported from here keep working
export type { SaveImageInput, ImageStorage } from '../../domain/ports/image-storage.port';

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Default directory for local image uploads (`<cwd>/tmp/uploads`). */
export const DEFAULT_LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'tmp', 'uploads');

/**
 * Resolves a `local://` image reference to an absolute filesystem path.
 * @param imageRef - Storage reference (e.g. `local://abc.jpg`).
 * @param uploadsDir - Base directory for uploads.
 * @returns Absolute file path or `null` if the reference format is invalid.
 */
export const resolveLocalImageFilePath = (
  imageRef: string,
  uploadsDir = DEFAULT_LOCAL_UPLOADS_DIR,
): string | null => {
  const match = imageRef.match(/^local:\/\/([a-zA-Z0-9._-]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return path.join(uploadsDir, match[1]);
};

/** Local-filesystem implementation of {@link ImageStorage} -- writes files to disk under `tmp/uploads`. */
export class LocalImageStorage implements ImageStorage {
  constructor(private readonly uploadsDir = DEFAULT_LOCAL_UPLOADS_DIR) {}

  /**
   * Writes a base64 image to the local uploads directory.
   * @param input - Image data and MIME type.
   * @returns A `local://<filename>` reference.
   */
  async save({ base64, mimeType }: SaveImageInput): Promise<string> {
    await mkdir(this.uploadsDir, { recursive: true });
    const extension = extensionByMime[mimeType] || 'img';
    const fileName = `${randomUUID()}.${extension}`;
    const filePath = path.join(this.uploadsDir, fileName);

    await writeFile(filePath, Buffer.from(base64, 'base64'));

    return `local://${fileName}`;
  }

  /**
   * No-op for local storage — local refs are `local://uuid.ext` (flat, no user prefix
   * in filename). Dev-only storage; cleanup is handled by DB cascade on chat sessions.
   */
  async deleteByPrefix(_prefix: string): Promise<void> {
    // Intentional no-op — see JSDoc above.
  }
}
