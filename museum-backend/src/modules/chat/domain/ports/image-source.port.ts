export const THUMBNAIL_WIDTH_PX = 330;

export interface ImageSourcePhoto {
  url: string;
  thumbnailUrl: string;
  caption: string;
  width: number;
  height: number;
  photographerName: string;
}

export interface ImageSourceClient {
  searchPhotos(query: string, perPage?: number): Promise<ImageSourcePhoto[]>;
}
