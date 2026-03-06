import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface SaveImageInput {
  base64: string;
  mimeType: string;
  objectKey?: string;
}

export interface ImageStorage {
  save(input: SaveImageInput): Promise<string>;
}

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const DEFAULT_LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'tmp', 'uploads');

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
}
