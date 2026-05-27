import { toIsoTimestamp } from '@src/config/env-helpers';

/**
 * NPS scale-epoch (F3).
 *
 * The review rating scale switched from 1-5 (legacy "stars") to 0-10 (NPS) in
 * the KR2 release. A legacy "5" is indistinguishable BY VALUE from an NPS "5",
 * yet under the 0-10 buckets a "5" reads as a *detractor* (≤6) — so counting
 * historical 1-5 reviews would push the NPS artificially negative on existing
 * data. `aggregateNps` therefore counts ONLY reviews created AT/AFTER this
 * epoch (`createdAt >= NPS_SCALE_EPOCH`).
 *
 * Default = the 0-10 deploy date (this PR). Overridable via the `NPS_SCALE_EPOCH`
 * environment variable (ISO-8601) for staging back-tests or a future
 * re-baseline. Invalid input degrades to the default (the resolver warns and
 * never throws), so a typo can never silently disable the cutoff.
 *
 * NOTE — resolved here (lightweight, reads `process.env` directly) rather than
 * via the `env` config singleton on purpose: pulling `@src/config/env` into the
 * repository's *static* import graph would force the DB-coupled singleton to
 * evaluate `PGDATABASE` before the integration testcontainer sets it, breaking
 * the harness. `env.review.npsScaleEpoch` mirrors this value for the AppEnv
 * contract / production validation; the two share the same default + parser.
 */
export const NPS_SCALE_EPOCH_DEFAULT = '2026-05-27T00:00:00.000Z';

/** Resolves the configured (or default) NPS scale-epoch as a valid ISO string. */
export const resolveNpsScaleEpoch = (): string =>
  toIsoTimestamp(process.env.NPS_SCALE_EPOCH, NPS_SCALE_EPOCH_DEFAULT);
