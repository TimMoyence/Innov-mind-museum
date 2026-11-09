import { z } from 'zod';

const detectedArtworkSchema = z
  .object({
    artworkId: z.string().nullable(),
    title: z.string().nullable(),
    artist: z.string().nullable(),
    confidence: z.number().nullable(),
    source: z.string().nullable(),
    museum: z.string().nullable(),
    room: z.string().nullable(),
  })
  .nullable();

const citationSourceEmissionSchema = z.object({
  url: z.string().describe('Absolute URL of the source — verbatim from the provided data blocks.'),
  type: z
    .enum(['wikidata', 'web', 'museum-catalog', 'commons'])
    .describe('Provenance of the source — one of the four V1 whitelisted values.'),
  title: z.string().describe('Short human-readable title for the source (1-300 chars).'),
  quote: z
    .string()
    .describe(
      'Verbatim NFKC-normalised substring of a fact block (10-500 chars). Post-validated by sources-validator.',
    ),
  confidence: z
    .number()
    .nullable()
    .describe('Optional 0..1 confidence score — null when the source is KB-direct.'),
});

const suggestedImageSchema = z.object({
  query: z
    .string()
    .describe(
      'Short search query that would surface an illustrative photo of the subject (e.g. "Mona Lisa Louvre", "Monet Water Lilies series").',
    ),
  description: z
    .string()
    .describe('One short sentence describing what the matching photo would show.'),
  rationale: z
    .string()
    .describe(
      'One short sentence explaining why this image illustrates the answer (e.g. "Shows the brushwork discussed above"). MUST NOT include any visitor PII (name, email, location).',
    ),
  caption: z.string().describe('≤8-word title used as the carousel thumbnail caption.'),
});

export const mainAssistantOutputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      'The full natural-language reply to the visitor. Plain prose only — no markdown headers, no JSON, no trailing metadata block. The visitor sees this verbatim.',
    ),
  deeperContext: z
    .string()
    .nullable()
    .describe(
      '2-3 sentence add-on with technical, historical or interpretive context. Set to null when the answer already covers it.',
    ),
  openQuestion: z
    .string()
    .nullable()
    .describe(
      'Open question encouraging the visitor to look more closely at the artwork. Set to null when not relevant.',
    ),
  imageDescription: z
    .string()
    .nullable()
    .describe(
      'When the visitor shared a photograph, the visual description used as evidence (foreground/background, composition, iconography). Set to null when no image was sent.',
    ),
  suggestedImages: z
    .array(suggestedImageSchema)
    .nullable()
    .describe(
      'When the topic is visual (a painting, sculpture, place, person, monument), 1-4 entries fanning out to image sources. Use 2-4 entries when the answer compares or covers multiple subjects (e.g. Monet vs Manet → one entry per artist). Set to null for non-visual topics (philosophy, abstract concepts).',
    ),
  detectedArtwork: detectedArtworkSchema.describe(
    'Identified artwork from the user image or text, with an attribution-confidence score. Set to null when nothing is identified — never fabricate.',
  ),
  recommendations: z
    .array(z.string())
    .nullable()
    .describe(
      'In museum mode, 1-3 nearby artworks or rooms the visitor could explore next. Outside museum mode, 1-2 related artworks or topics. Set to null when nothing relevant.',
    ),
  expertiseSignal: z
    .enum(['beginner', 'intermediate', 'expert'])
    .nullable()
    .describe(
      'Detected visitor expertise level inferred from the question phrasing. Set to null when the signal is too weak to call.',
    ),
  citations: z
    .array(z.string())
    .nullable()
    .describe('Optional source identifiers used to ground the answer. Null when none.'),
  sources: z
    .array(citationSourceEmissionSchema)
    .nullable()
    .describe(
      'Citations v2 — verbatim {url,type,title,quote,confidence} grounded in the data blocks provided in context. Quote MUST be a verbatim substring of one of those blocks (post-validated by sources-validator). Null when no fact-grounded source applies.',
    ),
});

export type MainAssistantOutput = z.infer<typeof mainAssistantOutputSchema>;
