import { z } from 'zod';

import {
  CONTENT_PREFERENCES,
  isContentPreference,
} from '@modules/auth/domain/consent/content-preference';
import { CHAT_SESSION_INTENTS } from '@modules/chat/domain/chat.types';

/**
 * Semantics (preserved from prior hand-rolled parsers):
 * - `''` counts as absent.
 * - Boolean: native or 'true'/'false' string.
 * - Number: native finite or numeric string.
 * - Error wording pinned for test compatibility.
 */

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

const COORDS_FINITE_MSG = 'coordinates.lat and coordinates.lng must be finite numbers';

const coordinatesSchema = z.object(
  {
    lat: z
      .number({ message: COORDS_FINITE_MSG })
      .refine(Number.isFinite, {
        message: COORDS_FINITE_MSG,
      })
      .refine((v) => v >= -90 && v <= 90, {
        message: 'coordinates.lat must be between -90 and 90',
      }),
    lng: z
      .number({ message: COORDS_FINITE_MSG })
      .refine(Number.isFinite, {
        message: COORDS_FINITE_MSG,
      })
      .refine((v) => v >= -180 && v <= 180, {
        message: 'coordinates.lng must be between -180 and 180',
      }),
  },
  { message: 'coordinates must be an object with lat and lng' },
);

const optionalCoordinates = z.preprocess(emptyStringAsUndefined, coordinatesSchema.optional());

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

export const postMessageSchema = z.object(
  {
    text: optionalNonEmptyString,
    image: optionalNonEmptyString,
    context: contextSchema,
  },
  { message: 'Payload must be an object' },
);

export type PostMessageBody = z.infer<typeof postMessageSchema>;
