export interface ImageSourcePhoto {
  url: string;
  thumbnailUrl: string;
  caption: string;
  width: number;
  height: number;
  photographerName: string;
}

export interface ImageSourceClient {
  /** Returns `[]` on any failure. */
  searchPhotos(query: string, perPage?: number): Promise<ImageSourcePhoto[]>;
}
