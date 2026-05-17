export interface SaveAudioInput {
  buffer: Buffer;
  contentType: string;
  /** UUID-based key generated when omitted. */
  objectKey?: string;
}

export interface SignedAudioReadUrl {
  url: string;
  expiresAt: string;
}

export interface AudioStorage {
  /** @returns storage reference URI (e.g. `s3://...` or `local://...`). */
  save(input: SaveAudioInput): Promise<string>;

  /** @returns `null` if the reference shape is unrecognized. */
  getSignedReadUrl(ref: string, ttlSeconds?: number): Promise<SignedAudioReadUrl | null>;

  deleteByRef(ref: string): Promise<void>;
}
