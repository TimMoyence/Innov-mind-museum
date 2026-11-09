export type EmbeddingImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface EncodeInput {
  buffer: Buffer;
  mimeType: EmbeddingImageMimeType;
}

export interface EncodeOutput {
  vector: Float32Array;
  modelVersion: string;
}

export interface EmbeddingsPort {
  encode(input: EncodeInput): Promise<EncodeOutput>;

  shutdown?(): Promise<void>;
}

export class EncoderUnavailableError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EncoderUnavailableError';
    this.cause = cause;
    Object.setPrototypeOf(this, EncoderUnavailableError.prototype);
  }
}
