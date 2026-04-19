import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  AudioStorage,
  SaveAudioInput,
  SignedAudioReadUrl,
} from '../../domain/ports/audio-storage.port';

/** Default directory for local TTS audio files (`<cwd>/tmp/audios`). */
export const DEFAULT_LOCAL_AUDIOS_DIR = path.join(process.cwd(), 'tmp', 'audios');

const extensionByContentType: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

/** Resolves a `local-audio://...` reference to an absolute filesystem path. */
export const resolveLocalAudioFilePath = (
  ref: string,
  audiosDir = DEFAULT_LOCAL_AUDIOS_DIR,
): string | null => {
  const match = /^local-audio:\/\/([a-zA-Z0-9._-]+)$/.exec(ref);
  if (!match?.[1]) return null;
  return path.join(audiosDir, match[1]);
};

/** Local-filesystem implementation of {@link AudioStorage} for dev. */
export class LocalAudioStorage implements AudioStorage {
  constructor(private readonly audiosDir = DEFAULT_LOCAL_AUDIOS_DIR) {}

  /** Writes audio buffer to the local audios directory and returns a `local-audio://` reference. */
  async save({ buffer, contentType, objectKey }: SaveAudioInput): Promise<string> {
    await mkdir(this.audiosDir, { recursive: true });
    const extension = extensionByContentType[contentType] ?? 'mp3';
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const fileName = objectKey || `${randomUUID()}.${extension}`;
    const filePath = path.join(this.audiosDir, fileName);
    await writeFile(filePath, buffer);
    return `local-audio://${fileName}`;
  }

  /** Returns a `file://` URL for the given `local-audio://` reference, or null if not found. */
  async getSignedReadUrl(ref: string): Promise<SignedAudioReadUrl | null> {
    const filePath = resolveLocalAudioFilePath(ref, this.audiosDir);
    if (!filePath) return null;
    try {
      await stat(filePath);
    } catch {
      return null;
    }
    return {
      url: `file://${filePath}`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  /** Deletes the local audio file referenced by a `local-audio://` ref; no-op on failure. */
  async deleteByRef(ref: string): Promise<void> {
    const filePath = resolveLocalAudioFilePath(ref, this.audiosDir);
    if (!filePath) return;
    try {
      await unlink(filePath);
    } catch {
      // best-effort delete
    }
  }
}
