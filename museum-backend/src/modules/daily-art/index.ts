/**
 * Daily-art module barrel.
 * Re-exports the public API: router factory, date-based selection, and artwork data/type.
 */

export { createDailyArtRouter, selectArtworkForDate, artworks } from './daily-art.route';
export type { Artwork } from './artworks.data';
