interface ConfidenceMergeable {
  confidence: number;
  needsReview: boolean;
}

export interface ConfidenceUpsertOptions<T> {
  sourceUrl: string;
  nullableFields: readonly (keyof T)[];
  preserveFields: readonly (keyof T)[];
  sourceUrlsField?: keyof T;
}

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
