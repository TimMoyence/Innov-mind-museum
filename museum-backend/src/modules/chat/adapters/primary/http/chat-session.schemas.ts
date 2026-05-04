import { z } from 'zod';

import {
  CONTENT_PREFERENCES,
  isContentPreference,
} from '@modules/auth/domain/consent/content-preference';
import { CHAT_SESSION_INTENTS } from '@modules/chat/domain/chat.types';

/**
 * Zod schemas for chat HTTP routes.
 *
 * Semantics preserved from the prior hand-rolled parsers in `chat.contracts.ts`:
 * - Empty string (`''`) counts as "absent" for optional fields.
 * - Boolean accepts native boolean or the strings `'true'` / `'false'`.
 * - Number accepts native finite number or a numeric string.
 * - Error messages keep the historic wording for test compatibility.
 */

/** Treats `''` / `null` / `undefined` as undefined; otherwise passes through. */
const emptyStringAsUndefined = (value: unknown): unknown =>
  value === '' || value === null ? undefined : value;

const optionalBoolean = z.preprocess(
  (value) => {
    const normalized = emptyStringAsUndefined(value);
    if (normalized === undefined) return normalized;
    if (typeof normalized === 'boolean') return normalized;
    if (typeof normalized === 'string') {
      const lower = normalized.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
    }
    return normalized;
  },
  z.boolean({ message: 'must be a boolean' }).optional(),
);

const optionalFiniteNumber = z.preprocess(
  (value) => {
    const normalized = emptyStringAsUndefined(value);
    if (normalized === undefined) return normalized;
    if (typeof normalized === 'number' && Number.isFinite(normalized)) return normalized;
    if (typeof normalized === 'string') {
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
    return normalized;
  },
  z.number({ message: 'must be a number' }).optional(),
);

const optionalNonEmptyString = z.preprocess(
  emptyStringAsUndefined,
  z.string({ message: 'must be a string' }).optional(),
);

const positiveIntegerMuseumId = optionalFiniteNumber.refine(
  (value) => value === undefined || (Number.isInteger(value) && value > 0),
  { message: 'museumId must be a positive integer' },
);

const coordinatesSchema = z.object(
  {
    lat: z
      .number({ message: 'coordinates.lat and coordinates.lng must be finite numbers' })
      .refine(Number.isFinite, {
        message: 'coordinates.lat and coordinates.lng must be finite numbers',
      })
      .refine((v) => v >= -90 && v <= 90, {
        message: 'coordinates.lat must be between -90 and 90',
      }),
    lng: z
      .number({ message: 'coordinates.lat and coordinates.lng must be finite numbers' })
      .refine(Number.isFinite, {
        message: 'coordinates.lat and coordinates.lng must be finite numbers',
      })
      .refine((v) => v >= -180 && v <= 180, {
        message: 'coordinates.lng must be between -180 and 180',
      }),
  },
  { message: 'coordinates must be an object with lat and lng' },
);

const optionalCoordinates = z.preprocess(emptyStringAsUndefined, coordinatesSchema.optional());

/** Zod schema for `POST /sessions` request body. */
export const createSessionSchema = z.object(
  {
    userId: optionalFiniteNumber,
    locale: optionalNonEmptyString,
    museumMode: optionalBoolean,
    museumId: positiveIntegerMuseumId,
    museumName: optionalNonEmptyString,
    museumAddress: optionalNonEmptyString,
    coordinates: optionalCoordinates,
    intent: z.enum(CHAT_SESSION_INTENTS).optional(),
  },
  { message: 'Payload must be an object' },
);

/** Inferred TS type for `POST /sessions` request body. */
export type CreateSessionBody = z.infer<typeof createSessionSchema>;

const guideLevelValues = ['beginner', 'intermediate', 'expert'] as const;

const guideLevelSchema = z.preprocess(
  emptyStringAsUndefined,
  z
    .string({ message: 'must be a string' })
    .refine((v) => (guideLevelValues as readonly string[]).includes(v), {
      message: `must be ${guideLevelValues.join(', ').replace(/, (?=[^,]*$)/, ', or ')}`,
    })
    .optional(),
);

const contextSchema = z
  .object(
    {
      location: optionalNonEmptyString,
      museumMode: optionalBoolean,
      guideLevel: guideLevelSchema,
      locale: optionalNonEmptyString,
      contentPreferences: z
        .array(
          z.unknown().refine(isContentPreference, {
            message: `values must be one of: ${CONTENT_PREFERENCES.join(', ')}`,
          }),
          {
            message: 'must be an array',
          },
        )
        .max(CONTENT_PREFERENCES.length, {
          message: `may contain at most ${String(CONTENT_PREFERENCES.length)} items`,
        })
        .optional(),
    },
    { message: 'must be an object' },
  )
  .optional();

/** Zod schema for `POST /sessions/:id/messages` request body. */
export const postMessageSchema = z.object(
  {
    text: optionalNonEmptyString,
    image: optionalNonEmptyString,
    context: contextSchema,
  },
  { message: 'Payload must be an object' },
);

/** Inferred TS type for `POST /sessions/:id/messages` request body. */
export type PostMessageBody = z.infer<typeof postMessageSchema>;
