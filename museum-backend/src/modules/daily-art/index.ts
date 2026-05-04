/**
 * Daily-art module barrel.
 * Re-exports the public API: router factory, date-based selection, and artwork data/type.
 */

export { createDailyArtRouter } from './adapters/primary/http/routes/daily-art.route';
export { selectArtworkForDate } from './useCase/listing/getDailyArtwork.useCase';
export { artworks } from './adapters/secondary/catalog/artworks.data';
export type { Artwork } from './domain/artwork/artwork.types';
