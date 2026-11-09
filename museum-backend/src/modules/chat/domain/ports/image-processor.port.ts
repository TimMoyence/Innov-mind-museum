export interface StrippedImage {
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
}

export interface ImageProcessorPort {
  stripExif(buffer: Buffer, mime: string): Promise<StrippedImage>;
}
