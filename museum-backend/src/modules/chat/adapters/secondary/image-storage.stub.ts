import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

interface SaveImageInput {
  base64: string;
  mimeType: string;
}

export interface ImageStorage {
  save(input: SaveImageInput): Promise<string>;
}

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class LocalImageStorage implements ImageStorage {
  constructor(private readonly uploadsDir = path.join(process.cwd(), 'tmp', 'uploads')) {}

  async save({ base64, mimeType }: SaveImageInput): Promise<string> {
    await mkdir(this.uploadsDir, { recursive: true });
    const extension = extensionByMime[mimeType] || 'img';
    const fileName = `${randomUUID()}.${extension}`;
    const filePath = path.join(this.uploadsDir, fileName);

    await writeFile(filePath, Buffer.from(base64, 'base64'));

    return `local://${fileName}`;
  }
}
