/** A photo result from an image source API. */
export interface ImageSourcePhoto {
  url: string;
  thumbnailUrl: string;
  caption: string;
  width: number;
  height: number;
  photographerName: string;
}

/** Port for searching images from an external source (Unsplash, etc.). */
export interface ImageSourceClient {
  /** Searches for photos matching the query. Returns `[]` on any failure. */
  searchPhotos(query: string, perPage?: number): Promise<ImageSourcePhoto[]>;
}
