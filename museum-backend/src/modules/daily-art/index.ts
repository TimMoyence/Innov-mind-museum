/**
 * Daily-art module barrel.
 * Re-exports the public API: router factory, date-based selection, and artwork data/type.
 */

export { createDailyArtRouter } from '@modules/daily-art/adapters/primary/http/routes/daily-art.route';
export { selectArtworkForDate } from '@modules/daily-art/useCase/listing/getDailyArtwork.useCase';
export { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';
export type { Artwork } from '@modules/daily-art/domain/artwork/artwork.types';
