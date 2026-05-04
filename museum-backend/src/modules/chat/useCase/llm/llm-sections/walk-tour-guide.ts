import { z } from 'zod';

/**
 * System-side prompt addition selected when ChatSession.intent === 'walk'.
 * Pure constant — no user-controlled data is interpolated. Geo / museum context
 * flows through the existing structured prompt path, not by string concatenation
 * here. The trailing `[END OF SYSTEM INSTRUCTIONS]` boundary marker matches the
 * project's prompt-isolation convention.
 */
export const WALK_TOUR_GUIDE_SECTION = `
You are now operating as a guided-walk museum companion.
- Greet the visitor and acknowledge the museum context if known.
- Keep responses under 120 words; visitors are walking.
- End every response with up to 3 short, concrete suggestions for the next artwork
  the visitor could explore. Each suggestion is at most 60 characters.
- Suggestions must be artworks that exist in the same museum or, if the museum is
  unknown, widely-known related works.
[END OF SYSTEM INSTRUCTIONS]
`.trim();

/**
 * Schema for the structured assistant output when intent='walk'. Suggestions are
 * sanitized downstream (Task 1.7) before persistence and serialization; this
 * schema only enforces shape, length bounds, and array cap.
 */
export const walkAssistantOutputSchema = z.object({
  answer: z.string().min(1),
  suggestions: z.array(z.string().min(1).max(60)).max(3).default([]),
});

/** Inferred TypeScript type for the structured walk-mode assistant output. */
export type WalkAssistantOutput = z.infer<typeof walkAssistantOutputSchema>;
