/**
 * Confidence-based merge helper shared by the knowledge-extraction TypeORM
 * repos (PR-16, audit B10-#1). Extracts the ~87 LOC duplicated between
 * `typeorm-artwork-knowledge.repo.ts` and `typeorm-museum-enrichment.repo.ts`.
 *
 * PURE / SYNC: receives an already-resolved `existing` row + the incoming
 * `data` payload + an explicit options bag, mutates `existing` in place per the
 * confidence branch, and returns the same reference. It does NOT do the find
 * (the identity lookup diverges per repo) nor the save (caller persists via
 * `repo.save(confidenceUpsert(...))`). Entity-mutation + `repo.save` avoids the
 * TypeORM `.update().set({field: undefined})` silent-skip gotcha.
 */

interface ConfidenceMergeable {
  confidence: number;
  needsReview: boolean;
}

export interface ConfidenceUpsertOptions<T> {
  /** Provenance URL dedup-appended to `existing[sourceUrlsField]` before the confidence branch. */
  sourceUrl: string;
  /**
   * Nullable keys eligible for backfill on the lower/equal-confidence branch.
   * EXPLICIT — never derived from the entity, so columns that are nullable but
   * intentionally out-of-backfill (e.g. museum `summary`/`wikidataQid`, artwork
   * `roomId`) stay untouched.
   */
  nullableFields: readonly (keyof T)[];
  /**
   * Keys preserved from `existing` on the overwrite branch (identity + provenance
   * + creation timestamp). `sourceUrls` is included so the already-merged array
   * is re-injected over the incoming payload.
   */
  preserveFields: readonly (keyof T)[];
  /** Provenance array field. Defaults to `'sourceUrls'`. */
  sourceUrlsField?: keyof T;
}

/**
 * Merge an incoming classification payload into an existing row by confidence:
 * 1. dedup-append `opts.sourceUrl` into the provenance array (immutable spread)
 * 2. if `data.confidence > existing.confidence` (strict): overwrite with `data`,
 *    then restore `preserveFields` from `existing`
 * 3. otherwise (lower OR equal): backfill `nullableFields` where `existing[k]`
 *    is null and `data[k]` provides a value
 * 4. always: `existing.needsReview = data.needsReview`
 *
 * @param existing the row resolved by the caller's identity lookup (mutated)
 * @param data the incoming payload (caller's `Omit<Entity, 'id' | …>` shape)
 * @param opts explicit field lists + provenance URL
 * @returns the same `existing` reference, mutated
 */
export function confidenceUpsert<T extends ConfidenceMergeable>(
  existing: T,
  data: Partial<T> & ConfidenceMergeable,
  opts: ConfidenceUpsertOptions<T>,
): T {
  const urlsKey = opts.sourceUrlsField ?? ('sourceUrls' as keyof T);
  const urls = existing[urlsKey] as unknown as string[];
  if (!urls.includes(opts.sourceUrl)) {
    (existing as Record<keyof T, unknown>)[urlsKey] = [...urls, opts.sourceUrl];
  }

  if (data.confidence > existing.confidence) {
    const preserved: Partial<T> = {};
    for (const key of opts.preserveFields) {
      preserved[key] = existing[key];
    }
    Object.assign(existing, data, preserved);
  } else {
    for (const key of opts.nullableFields) {
      if (existing[key] === null && data[key] !== null) {
        (existing as Record<keyof T, unknown>)[key] = data[key];
      }
    }
  }

  existing.needsReview = data.needsReview;
  return existing;
}
