# D — JSONB Zod Runtime Validation

**Date:** 2026-05-01
**Subsystem:** D of A→H scale-hardening decomposition
**Status:** Approved (autonomous mode)
**Predecessors:** A1+A2 indexes, C data debt
**Successors:** E retention, F infra, G AI cache, H observability

---

## 1. Context

Postgres `jsonb` columns are schemaless at the DB level — applications can write any structure. Without runtime validation, a buggy migration, an old client, or a copy-paste typo can silently insert malformed JSON; downstream readers either crash or, worse, treat invalid data as valid.

Twelve `jsonb` columns currently have no write-side validation. Some are well-shaped (opening hours per day, admission fees, recovery codes), some are deliberately permissive (audit metadata, museum config). Both classes deserve at minimum a "must be a JSON object/array, not a primitive or null-when-not-allowed" guard. Well-shaped fields deserve full Zod schemas.

## 2. Goals

1. **Zod schema per `jsonb` column** declaring the shape we expect. Strict where shape is known; permissive `z.record(z.unknown())` where the field is intentionally generic.
2. **TypeORM transformer per column** that runs the schema's `.parse()` on every write (`to`) call. Invalid writes throw before the row hits Postgres.
3. **Zero runtime cost on read** (`from` is identity).
4. **Shared error shape** so the global error middleware emits a 422 with the offending field path on validation failure.
5. **No backfill of existing rows** — any historical row with a now-invalid shape stays in the DB; reads either tolerate it (loose schemas) or surface it as a typed error at the use case layer (which is the right place to handle stale data).

Non-goals:

- Validating reads (`from`). Stale rows handled at use case.
- Forcing strict schemas on intentionally-loose fields (`audit_logs.metadata`, `museum_qa_seed.metadata`, `museums.config`).
- Migrating existing data shapes.

---

## 3. Inventory — 12 columns

| # | Entity / column | Shape class | Schema file |
|---|---|---|---|
| 1 | `chat_messages.metadata` | Loose record (assistant tool calls, debug bag) | `chat-message-metadata.schema.ts` |
| 2 | `museum_enrichment.openingHours` | Strict (`Record<weekday, OpeningRange[]>`) | `museum-enrichment.schemas.ts` |
| 3 | `museum_enrichment.admissionFees` | Strict (price tiers) | `museum-enrichment.schemas.ts` |
| 4 | `museum_enrichment.collections` | Strict (`string[]`) | `museum-enrichment.schemas.ts` |
| 5 | `museum_enrichment.currentExhibitions` | Strict (exhibition objects) | `museum-enrichment.schemas.ts` |
| 6 | `museum_enrichment.accessibility` | Strict (boolean flags) | `museum-enrichment.schemas.ts` |
| 7 | `museum_enrichment.sourceUrls` | Strict (`string[]` url-shape) | `museum-enrichment.schemas.ts` |
| 8 | `museums.config` | Loose record (admin-tunable runtime config) | `museum-config.schema.ts` |
| 9 | `audit_logs.metadata` | Loose record (audit context) | `audit-metadata.schema.ts` |
| 10 | `totp_secrets.recovery_codes` | Strict (`string[]` of recovery codes) | `totp-recovery-codes.schema.ts` |
| 11 | `user_memories.notableArtworks` | Strict (artwork objects) | `user-memory-notable-artworks.schema.ts` |
| 12 | `museum_qa_seed.metadata` | Loose record (pack metadata) | `museum-qa-seed-metadata.schema.ts` |

For loose-record fields (1, 8, 9, 12): `z.record(z.string(), z.unknown())` — refuses non-object writes (string, number, array, primitive null when column is not nullable). Cheap insurance.

For strict fields (2-7, 10, 11): full Zod object with the discovered shape. Discovered by reading existing entity TypeScript types (which carry the intent) and the small set of write call sites.

---

## 4. Architecture

### 4.1 Shared validator helper

`museum-backend/src/shared/db/jsonb-validator.ts`:

```ts
import type { ValueTransformer } from 'typeorm';
import type { ZodSchema } from 'zod';

import { AppError } from '@shared/errors/app-error';
import { logger } from '@shared/logger/logger';

/**
 * Builds a TypeORM column transformer that runs the supplied Zod schema's
 * `.parse()` on every write. Invalid writes throw an AppError(422) with the
 * field path inside `details.path`. Reads pass through untouched.
 *
 * Use as the `transformer` option on a `@Column({ type: 'jsonb' })`:
 *
 *   @Column({ type: 'jsonb', transformer: jsonbValidator(MyShape, 'my_table.my_col') })
 *   field!: z.infer<typeof MyShape>;
 */
export function jsonbValidator<S extends ZodSchema>(
  schema: S,
  fieldName: string,
): ValueTransformer {
  return {
    to(value: unknown): unknown {
      if (value === null || value === undefined) return value;
      const result = schema.safeParse(value);
      if (!result.success) {
        logger.warn('jsonb_validation_failed', {
          field: fieldName,
          issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        throw new AppError({
          message: `Invalid JSONB shape for ${fieldName}`,
          statusCode: 422,
          code: 'JSONB_VALIDATION',
          details: {
            field: fieldName,
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      return result.data;
    },
    from(value: unknown): unknown {
      return value;
    },
  };
}
```

`AppError` already exists in `src/shared/errors/`; use the existing constructor signature (verify before authoring).

### 4.2 Schema files

Co-locate schemas under `museum-backend/src/shared/db/jsonb-schemas/<scope>.schemas.ts`. One file per entity (`museum-enrichment.schemas.ts` aggregates all six) or per single-column (`audit-metadata.schema.ts`).

Each schema file exports:
- The Zod schema(s).
- The TypeScript type `z.infer<typeof XSchema>`.

Entities import the type and use it as the column's TS type, plus the transformer factory.

Example (museum_enrichment.openingHours):

```ts
// src/shared/db/jsonb-schemas/museum-enrichment.schemas.ts
import { z } from 'zod';

const TimeRangeSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

export const OpeningHoursSchema = z
  .object({
    monday: z.array(TimeRangeSchema).optional(),
    tuesday: z.array(TimeRangeSchema).optional(),
    wednesday: z.array(TimeRangeSchema).optional(),
    thursday: z.array(TimeRangeSchema).optional(),
    friday: z.array(TimeRangeSchema).optional(),
    saturday: z.array(TimeRangeSchema).optional(),
    sunday: z.array(TimeRangeSchema).optional(),
  })
  .strict();
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

export const AdmissionFeesSchema = z.array(
  z.object({
    label: z.string().min(1).max(64),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
);
export type AdmissionFees = z.infer<typeof AdmissionFeesSchema>;

export const CollectionsSchema = z.array(z.string().min(1).max(120));
export type Collections = z.infer<typeof CollectionsSchema>;

export const CurrentExhibitionsSchema = z.array(
  z.object({
    title: z.string().min(1).max(256),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    url: z.string().url().nullable().optional(),
  }),
);
export type CurrentExhibitions = z.infer<typeof CurrentExhibitionsSchema>;

export const AccessibilitySchema = z
  .object({
    wheelchair: z.boolean().optional(),
    audioGuide: z.boolean().optional(),
    signLanguage: z.boolean().optional(),
    notes: z.string().max(2048).optional(),
  })
  .strict();
export type Accessibility = z.infer<typeof AccessibilitySchema>;

export const SourceUrlsSchema = z.array(z.string().url()).max(64);
export type SourceUrls = z.infer<typeof SourceUrlsSchema>;
```

The exact shapes above are best-effort guesses based on the column names. The implementer MUST read the existing entity TypeScript types AND the existing write call sites (worker code that populates these fields) before locking the schema. If a real row in dev DB has a field shape inconsistent with the proposed schema, widen the schema rather than tightening to break existing data.

### 4.3 Wiring on entities

```ts
// e.g. src/modules/knowledge-extraction/domain/museum-enrichment.entity.ts
import {
  OpeningHoursSchema,
  type OpeningHours,
} from '@shared/db/jsonb-schemas/museum-enrichment.schemas';
import { jsonbValidator } from '@shared/db/jsonb-validator';

// ...
@Column({
  type: 'jsonb',
  nullable: true,
  transformer: jsonbValidator(OpeningHoursSchema, 'museum_enrichment.openingHours'),
})
openingHours?: OpeningHours | null;
```

The TS type on the property is the inferred Zod type — guarantees compile-time consumers cannot construct invalid shapes either.

---

## 5. Loose schemas (4 fields)

For `chat_messages.metadata`, `museums.config`, `audit_logs.metadata`, `museum_qa_seed.metadata` — all four are intentionally generic. The schema is identical:

```ts
export const LooseRecordSchema = z.record(z.string(), z.unknown());
export type LooseRecord = z.infer<typeof LooseRecordSchema>;
```

Define once in `src/shared/db/jsonb-schemas/loose-record.schema.ts`, import in all four places. The shared schema rejects primitives (string, number, boolean, null when non-nullable) and arrays — anything that is not a JSON object — preventing accidental writes of `metadata = "raw string"`.

The TS type of the property stays `Record<string, unknown> | null` (matches `LooseRecord`).

---

## 6. Tests

Three layers:

### 6.1 Validator unit tests

`tests/unit/shared/db/jsonb-validator.test.ts`:
- Valid object → returns the parsed object.
- Invalid object → throws AppError with statusCode=422 + field name + path.
- `null` → passes through (column nullable).
- `undefined` → passes through.
- Read path (`from`) → identity.

### 6.2 Schema unit tests

`tests/unit/shared/db/jsonb-schemas/<schema>.test.ts` for each strict schema. Cover:
- Happy path (valid sample object).
- Each constraint boundary (e.g. `priceCents` negative rejected, `currency.length !== 3` rejected, `time` regex mismatch rejected).
- Loose schema: object accepted, primitive rejected.

### 6.3 Integration test (one representative)

`tests/integration/data/db/jsonb-validation.test.ts` (skipped by default, manually-runnable):
- Open a real DataSource against `TEST_DATABASE_URL`.
- Try to save a `MuseumEnrichment` with `openingHours = { monday: [{ open: 'invalid', close: '18:00' }] }`.
- Expect AppError(422).
- Try to save valid → succeeds.

Skipped because needs a live DB. Runs manually.

---

## 7. File map

```
museum-backend/src/shared/db/
├── jsonb-validator.ts                                 NEW — helper
└── jsonb-schemas/
    ├── loose-record.schema.ts                         NEW — shared loose
    ├── chat-message-metadata.schema.ts                NEW — re-exports loose
    ├── museum-config.schema.ts                        NEW — re-exports loose
    ├── audit-metadata.schema.ts                       NEW — re-exports loose
    ├── museum-qa-seed-metadata.schema.ts              NEW — re-exports loose
    ├── museum-enrichment.schemas.ts                   NEW — 6 strict
    ├── totp-recovery-codes.schema.ts                  NEW — strict array
    └── user-memory-notable-artworks.schema.ts         NEW — strict array

museum-backend/src/modules/
├── chat/domain/
│   ├── chatMessage.entity.ts                          MODIFY — wire validator
│   └── userMemory.entity.ts                           MODIFY — wire validator
├── museum/domain/
│   ├── museum.entity.ts                               MODIFY — wire validator
│   └── museumQaSeed.entity.ts                         MODIFY — wire validator
├── knowledge-extraction/domain/
│   └── museum-enrichment.entity.ts                    MODIFY — wire 6 validators
└── auth/domain/
    └── totp-secret.entity.ts                          MODIFY — wire validator

museum-backend/src/shared/audit/
└── auditLog.entity.ts                                 MODIFY — wire validator

museum-backend/tests/unit/shared/db/
├── jsonb-validator.test.ts                            NEW
└── jsonb-schemas/
    ├── loose-record.test.ts                           NEW
    ├── museum-enrichment-schemas.test.ts              NEW (one file covers 6)
    ├── totp-recovery-codes.test.ts                    NEW
    └── user-memory-notable-artworks.test.ts           NEW

museum-backend/tests/integration/data/db/
└── jsonb-validation.test.ts                           NEW — describe.skip
```

---

## 8. Acceptance criteria

- All 12 jsonb columns wired to a Zod-validated transformer.
- Writing an invalid shape → AppError(422) with `details.field` + `details.issues[]`.
- Writing valid → unchanged behavior.
- Existing entity types compile (Zod-inferred types match).
- `pnpm test --silent` reports `0 failed` (modulo known F13 flakes).
- `pnpm exec tsc --noEmit` clean.
- Drift check post-D: only pre-existing totp_secrets default cast.

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Existing rows in dev/staging/prod have shapes that fail the new schema. | Loose-by-default for fields without strong shape signal. For strict schemas, derive shape from existing TypeScript types + grep all write sites first; widen if data already drifts. |
| Reads receive stale rows with shapes the application no longer accepts on write. | Read path is identity (no validation). Use case layer can opt into Zod parsing on read where needed (out of scope for D). |
| Performance — `safeParse` on every write. | Negligible — Zod parsing of small objects is microseconds. Worker writes are not throughput-critical paths. |
| TypeORM transformer fires inside the transaction so a failed validation rolls back the whole transaction. | Acceptable — that is the desired behavior. The use case layer should validate input shape BEFORE attempting save when possible. |

## 10. Out of scope

- Read-side schema enforcement.
- Backfilling stale rows.
- Validating `chat_sessions.coordinates` / `visitContext` (audit did not flag — own follow-up if desired).
- Validating `artwork_knowledge.*` jsonb fields.
