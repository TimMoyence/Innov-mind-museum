import { z } from 'zod';

/**
 * Notable artworks stored in user_memories.notableArtworks.
 *
 * Shape matches the NotableArtwork interface in
 * src/modules/chat/domain/userMemory.types.ts. The array defaults to []
 * on first insert. artist, museum are optional.
 */
export const NotableArtworkSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional(),
  museum: z.string().optional(),
  sessionId: z.string().min(1),
  discussedAt: z.string().min(1),
});

export const NotableArtworksSchema = z.array(NotableArtworkSchema);
/**
 *
 */
export type NotableArtwork = z.infer<typeof NotableArtworkSchema>;
/**
 *
 */
export type NotableArtworks = z.infer<typeof NotableArtworksSchema>;
