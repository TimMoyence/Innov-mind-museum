export interface SaveAudioInput {
  buffer: Buffer;
  contentType: string;
  objectKey?: string;
}

export interface SignedAudioReadUrl {
  url: string;
  expiresAt: string;
}

export interface AudioStorage {
  save(input: SaveAudioInput): Promise<string>;

  getSignedReadUrl(ref: string, ttlSeconds?: number): Promise<SignedAudioReadUrl | null>;

  deleteByRef(ref: string): Promise<void>;
}
