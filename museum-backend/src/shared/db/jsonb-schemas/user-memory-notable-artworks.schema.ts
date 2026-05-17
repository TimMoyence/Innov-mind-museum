import { z } from 'zod';

/**
 * `user_memories.notableArtworks`. Shape matches NotableArtwork in
 * src/modules/chat/domain/userMemory.types.ts. Defaults `[]` on first insert.
 */
export const NotableArtworkSchema = z.object({
  title: z.string().min(1),
  artist: z.string().optional(),
  museum: z.string().optional(),
  sessionId: z.string().min(1),
  discussedAt: z.string().min(1),
});

export const NotableArtworksSchema = z.array(NotableArtworkSchema);
export type NotableArtwork = z.infer<typeof NotableArtworkSchema>;
export type NotableArtworks = z.infer<typeof NotableArtworksSchema>;
