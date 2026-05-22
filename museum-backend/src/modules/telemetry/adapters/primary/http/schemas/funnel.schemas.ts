import { z } from 'zod';

/**
 * Wave C5 / T-C55 — Zod schema for `POST /api/telemetry/funnel`.
 *
 * Lib-docs reference : `lib-docs/plausible/PATTERNS.md` §2 (Events API body
 * parameters : `name`/`url`/`domain` required, `props` ≤30 keys) + §5
 * anti-pattern #1 (no PII in props ; defense-in-depth via secondary
 * adapter strip).
 *
 * `props` values are constrained to scalar `string | number | boolean` so
 * the schema rejects nested objects (which Plausible would silently drop)
 * AND reduces the PII surface (no nested objects = no nested PII).
 */
const propsValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const funnelEventSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  domain: z.string().trim().min(1).max(253),
  referrer: z.string().trim().max(2000).optional(),
  props: z.record(z.string().min(1).max(80), propsValueSchema).optional(),
});

export type FunnelEventInput = z.infer<typeof funnelEventSchema>;
