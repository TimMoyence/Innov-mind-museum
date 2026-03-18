import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

/** Input for persisting a base64-encoded image to storage. */
export interface SaveImageInput {
  /** Raw base64 image data (no data-URI prefix). */
  base64: string;
  /** MIME type (e.g. `image/jpeg`). */
  mimeType: string;
  /** Optional explicit object key; a UUID-based key is generated when omitted. */
  objectKey?: string;
}

/** Port for storing chat-related images (S3 or local filesystem). */
export interface ImageStorage {
  /**
   * Persists an image and returns a storage reference string (e.g. `local://...` or `s3://...`).
   * @param input - Base64 data, MIME type, and optional key.
   * @returns A storage reference URI.
   */
  save(input: SaveImageInput): Promise<string>;
}

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

/** Local-filesystem implementation of {@link ImageStorage} — writes files to disk under `tmp/uploads`. */
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
}
