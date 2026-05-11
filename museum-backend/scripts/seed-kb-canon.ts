#!/usr/bin/env -S node --import tsx
/**
 * C5.3 Phase A — canonical seed CLI for `wikidata_kb_dump`.
 *
 * Usage :
 *   pnpm run seed:kb-canon                                # default (~50 terms × en+fr)
 *   pnpm run seed:kb-canon -- --dry-run                   # report hits, no UPSERT
 *   pnpm run seed:kb-canon -- --languages=en              # English only
 *   pnpm run seed:kb-canon -- --terms="Mona Lisa,David"   # custom terms (comma-sep)
 *
 * Behaviour :
 *   - Connects via {@link AppDataSource} ; reads the same `.env` as the
 *     backend process (`scripts/with-host-env.sh` overrides for local stack).
 *   - Walks (terms × languages) ; fetches facts via the live `WikidataClient` ;
 *     UPSERTs each non-null result through `WikidataKbDumpRepositoryTypeOrm`.
 *   - Idempotent : re-running on the same input set just refreshes
 *     `updated_at` on existing rows.
 *   - Fail-open : a single bad term does NOT abort the run ; counters are
 *     printed at exit so the operator can audit hit/miss/error totals.
 *
 * The script is intentionally small — the testable logic lives in
 * `src/modules/chat/useCase/knowledge/seed-kb-canon.ts` and is unit-tested
 * against mocks.
 */

import process from 'node:process';

import { WikidataKbDumpRepositoryTypeOrm } from '@modules/chat/adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import {
  DEFAULT_CANON_LANGUAGES,
  DEFAULT_CANON_TERMS,
  seedKbCanon,
} from '@modules/chat/useCase/knowledge/seed-kb-canon';
import { AppDataSource } from '@src/data/db/data-source';
import { logger } from '@shared/logger/logger';

interface CliFlags {
  readonly dryRun: boolean;
  readonly terms: readonly string[];
  readonly languages: readonly string[];
}

function parseFlags(argv: readonly string[]): CliFlags {
  const args = argv.slice(2);
  const has = (key: string): boolean => args.includes(key);
  const value = (key: string): string | undefined => {
    const flag = args.find((a) => a.startsWith(`${key}=`));
    return flag ? flag.slice(key.length + 1) : undefined;
  };

  const termsArg = value('--terms');
  const langsArg = value('--languages');

  return {
    dryRun: has('--dry-run'),
    terms: termsArg ? termsArg.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CANON_TERMS,
    languages: langsArg
      ? langsArg.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_CANON_LANGUAGES,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);

  logger.info('kb_canon_seed_start', {
    dryRun: flags.dryRun,
    termCount: flags.terms.length,
    languages: flags.languages,
  });

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    const client = new WikidataClient();
    const repo = new WikidataKbDumpRepositoryTypeOrm(AppDataSource);

    const result = await seedKbCanon({
      client,
      repo,
      terms: flags.terms,
      languages: flags.languages,
      dryRun: flags.dryRun,
    });

    logger.info('kb_canon_seed_complete', result);
    // Friendly stdout summary for ops eyeballing the CLI exit.
    process.stdout.write(
      `seed-kb-canon — total=${result.total} attempted=${result.attempted} ` +
        `hits=${result.hits} upserted=${result.upserted} errors=${result.errors}\n`,
    );
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((err: unknown) => {
  logger.error('kb_canon_seed_fatal', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});
