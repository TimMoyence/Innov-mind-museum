export interface SaveImageInput {
  base64: string;
  mimeType: string;
  objectKey?: string;
  userId?: number;
}

export type LegacyImageKeyFetcher = (userId: number) => Promise<string[]>;

export interface ImageStorage {
  save(input: SaveImageInput): Promise<string>;

  deleteByPrefix(userId: number | string, legacyFetcher?: LegacyImageKeyFetcher): Promise<void>;
}
