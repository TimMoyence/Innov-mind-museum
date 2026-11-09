import sharp from 'sharp';

import type {
  ArtworkImageLicense,
  ArtworkImageSource,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';
import type { DataSource } from 'typeorm';

export const EMBEDDING_DIM = 768;

export const makeCenterCroppedQueryBuffer = async (
  buffer: Buffer,
  frac: number,
): Promise<Buffer> => {
  if (!(frac > 0 && frac <= 1)) {
    throw new Error(`makeCenterCroppedQueryBuffer: frac must be in (0, 1], got ${String(frac)}`);
  }
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error('makeCenterCroppedQueryBuffer: source image has no decodable dimensions');
  }
  const cropW = Math.max(1, Math.round(width * frac));
  const cropH = Math.max(1, Math.round(height * frac));
  const left = Math.floor((width - cropW) / 2);
  const top = Math.floor((height - cropH) / 2);
  return await sharp(buffer).extract({ left, top, width: cropW, height: cropH }).jpeg().toBuffer();
};

export const makeHalfvecLiteral = (value = 0.1, dim: number = EMBEDDING_DIM): string => {
  const components = Array<number>(dim).fill(value);
  return `[${components.join(',')}]`;
};

export interface ArtworkEmbeddingRowFixture {
  qid: string;
  museum_qid: string | null;
  title: string;
  image_url: string;
  license: ArtworkImageLicense;
  image_source: ArtworkImageSource;
  embedding: string;
  embedding_model_version: string;
}

export const makeArtworkEmbeddingRow = (
  overrides: Partial<ArtworkEmbeddingRowFixture> = {},
): ArtworkEmbeddingRowFixture => ({
  qid: 'Q12418',
  museum_qid: 'Q19675',
  title: 'Mona Lisa',
  image_url:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa.jpg/600px-Mona_Lisa.jpg',
  license: 'public-domain',
  image_source: 'wikimedia',
  embedding: makeHalfvecLiteral(),
  embedding_model_version: 'siglip2-base-patch16-224@v1',
  ...overrides,
});

export const makeNormalisedFloat32 = (seedIndex = 0, dim: number = EMBEDDING_DIM): Float32Array => {
  const vec = new Float32Array(dim);
  vec[seedIndex % dim] = 1;
  return vec;
};

export const makeNormalisedVectorLiteral = (seedIndex = 0, dim: number = EMBEDDING_DIM): string => {
  const components = Array<number>(dim).fill(0);
  components[seedIndex % dim] = 1;
  return `[${components.join(',')}]`;
};

export const countArtworkEmbeddings = async (dataSource: DataSource): Promise<number> => {
  const rows: { count: string }[] = await dataSource.query(
    'SELECT COUNT(*)::text AS count FROM artwork_embeddings',
  );
  return Number(rows[0]?.count ?? 0);
};
