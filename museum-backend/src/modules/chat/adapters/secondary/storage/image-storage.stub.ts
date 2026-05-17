import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extensionByMime } from '@shared/media/mime-extensions';

import type {
  ImageStorage,
  LegacyImageKeyFetcher,
  SaveImageInput,
} from '@modules/chat/domain/ports/image-storage.port';

export const DEFAULT_LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'tmp', 'uploads');

export const resolveLocalImageFilePath = (
  imageRef: string,
  uploadsDir = DEFAULT_LOCAL_UPLOADS_DIR,
): string | null => {
  const match = /^local:\/\/([a-zA-Z0-9._-]+)$/.exec(imageRef);
  if (!match?.[1]) {
    return null;
  }

  return path.join(uploadsDir, match[1]);
};

/** Dev-only — writes files to disk under `tmp/uploads`. */
export class LocalImageStorage implements ImageStorage {
  constructor(private readonly uploadsDir = DEFAULT_LOCAL_UPLOADS_DIR) {}

  async save({ base64, mimeType }: SaveImageInput): Promise<string> {
    await mkdir(this.uploadsDir, { recursive: true });
    const extension = extensionByMime[mimeType] || 'img';
    const fileName = `${randomUUID()}.${extension}`;
    const filePath = path.join(this.uploadsDir, fileName);

    await writeFile(filePath, Buffer.from(base64, 'base64'));

    return `local://${fileName}`;
  }

  /**
   * No-op — local refs are flat `local://uuid.ext` (no user prefix); dev-only,
   * cleanup handled by DB cascade on chat sessions.
   */
  async deleteByPrefix(
    _userId: number | string,
    _legacyFetcher?: LegacyImageKeyFetcher,
  ): Promise<void> {
    // Intentional no-op.
  }
}
