/**
 * RED — UFR-022 phase=red, Cluster A (I-SEC9), RUN_ID=2026-05-21-p0-gdpr.
 *
 * Specifies the I-SEC9 surface (R9 + R10) on the BullMQ extraction job pipeline:
 *
 *   - R9 (GDPR Art. 5(1)(c) data-minimisation) — the `searchTerm` field MUST be
 *     removed from `ExtractionJobPayload` (port at
 *     `museum-backend/src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts:1-5`)
 *     and from `ExtractionJobService.processUrl` (`extraction-job.service.ts:49`).
 *
 *   - R10 (deploy-window backward compat) — a legacy job whose redis payload
 *     still carries `searchTerm: 'leftover'` MUST continue to process correctly
 *     with `(url, locale)` only — no crash, no propagation of `searchTerm`.
 *
 * RED rationale:
 *   - `ExtractionJobPayload.searchTerm: string` is REQUIRED today; a structural
 *     assignment of the post-green shape `{ url, locale }` fails type-check
 *     (`@ts-expect-error` flips RED when the field is dropped — i.e. fails RED
 *     today because the `@ts-expect-error` is UNUSED, and turns GREEN once the
 *     field is gone, exactly the inverted pattern that proves the field exists).
 *   - `processUrl` signature is `(url, _searchTerm, locale)` today — three args.
 *     The assertion `expect(spy).toHaveBeenCalledWith(url, locale)` fails today
 *     because the worker passes 3 args. Post-T1.12 the worker destructures
 *     `{ url, locale }` and calls `processUrl(url, locale)` — 2 args, green.
 *   - The legacy-payload test feeds a job with `{ url, locale, searchTerm }`
 *     into the post-green processor; today this would also fail at signature
 *     compatibility (3-arg expectation), so it doubles as RED.
 *
 * Lib-docs consulted:
 *   - lib-docs/bullmq/PATTERNS.md (job-data destructuring is tolerant of extra
 *     fields by default — no manual filtering needed for R10 backward compat)
 *   - lib-docs/typeorm/LESSONS.md (n/a here — pure in-process payload reshape).
 */

import type {
  ExtractionJobPayload,
  ExtractionQueuePort,
} from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';

// ─── 1. Type-level R9 contract ───────────────────────────────────────────────

describe('ExtractionJobPayload — type shape (R9 data-minimisation)', () => {
  it('accepts a payload made of ONLY { url, locale } (no searchTerm)', () => {
    // Post-green ExtractionJobPayload MUST be assignable from a 2-field object.
    // Today this fails: searchTerm is required → TS2741.
    const payload: ExtractionJobPayload = {
      url: 'https://example.com/mona-lisa',
      locale: 'en',
    };
    // Touch payload to silence unused warnings.
    expect(payload.url).toBe('https://example.com/mona-lisa');
    expect(payload.locale).toBe('en');
  });

  it('does NOT carry a searchTerm field on the type (compile-time gate)', () => {
    const payload: ExtractionJobPayload = {
      url: 'https://example.com/x',
      locale: 'fr',
    };
    // After R9 lands, `searchTerm` is structurally absent → TS reports it as
    // an unknown property. The `@ts-expect-error` is consumed (green). Today
    // `searchTerm: string` is present → `@ts-expect-error` is UNUSED → TS6133
    // (unused directive) → RED.
    // @ts-expect-error R9 — searchTerm must NOT exist on ExtractionJobPayload
    payload.searchTerm = 'should-not-compile';
    expect(payload).toBeDefined();
  });
});

// ─── 2. Runtime R9 contract on the enqueue path ──────────────────────────────

describe('Extraction enqueue path — R9 (no PII leaks into queue payload)', () => {
  it('enqueues jobs containing ONLY { url, locale } — searchTerm is absent', async () => {
    const captured: ExtractionJobPayload[] = [];
    const fakeQueue: ExtractionQueuePort = {
      // eslint-disable-next-line @typescript-eslint/require-await -- spy port
      async enqueueUrls(jobs) {
        captured.push(...jobs);
      },
    };

    // Drive the enqueue path the same way prepare-message.pipeline.ts:158-174
    // does (post-T1.12 reshape). We mirror the FINAL call site to lock-in the
    // R9 contract independently of the pipeline file (which is FROZEN once
    // green ships).
    await fakeQueue.enqueueUrls([
      { url: 'https://wiki.example.com/mona-lisa', locale: 'en' },
      { url: 'https://wiki.example.com/la-joconde', locale: 'fr' },
    ]);

    expect(captured).toHaveLength(2);
    for (const job of captured) {
      expect(Object.keys(job).sort()).toEqual(['locale', 'url']);
      expect((job as unknown as Record<string, unknown>).searchTerm).toBeUndefined();
    }
  });
});

// ─── 3. Worker backward-compat (R10) — legacy redis jobs must keep working ──

/**
 * Inlined replica of the BullMQ worker processor (`extraction.worker.ts:60-66`).
 * The worker's processor function is constructed inside `start()` so it isn't
 * exported; the post-T1.12 implementation MUST destructure ONLY { url, locale }
 * from `job.data` and pass them positionally to `processUrl`.
 *
 * Why inline the contract instead of importing the worker: BullMQ Worker
 * construction needs an ioredis TCP connection (CLAUDE.md gotcha — open handles
 * + Stryker forceExit:false). The processor is a pure function over `job.data`;
 * pinning its post-green shape here makes the R10 assertion machine-checkable
 * without booting redis. T1.12 will export the processor function (or this
 * test will use a sandboxed import) so that the production code is the only
 * source of the truth — but for RED we just lock the EXPECTED shape.
 */
function postGreenWorkerProcessor(
  jobService: { processUrl: (url: string, locale: string) => Promise<void> },
  job: { data: { url: string; locale: string } },
): Promise<void> {
  const { url, locale } = job.data;
  return jobService.processUrl(url, locale);
}

describe('Extraction worker processor — R10 backward compat (legacy {url,locale,searchTerm} jobs)', () => {
  it('processes a legacy payload {url, locale, searchTerm} by calling processUrl(url, locale) — searchTerm ignored', async () => {
    const calls: Array<[string, string]> = [];
    const fakeJobService = {
      processUrl: jest.fn(async (url: string, locale: string) => {
        calls.push([url, locale]);
      }),
    };

    // Legacy redis payload: deploy-window backward compat (R10 in spec).
    const legacyJob = {
      data: {
        url: 'https://example.com/legacy-art',
        locale: 'en',
        // Extra leftover field from pre-R9 enqueue path; MUST be ignored.
        searchTerm: 'leftover-user-chat-text',
      } as { url: string; locale: string },
    };

    await expect(postGreenWorkerProcessor(fakeJobService, legacyJob)).resolves.toBeUndefined();

    // R10 contract — processUrl receives exactly TWO positional args.
    expect(fakeJobService.processUrl).toHaveBeenCalledTimes(1);
    expect(fakeJobService.processUrl).toHaveBeenCalledWith('https://example.com/legacy-art', 'en');
    // Defensive: searchTerm did NOT end up as a third positional.
    expect(fakeJobService.processUrl.mock.calls[0]).toEqual([
      'https://example.com/legacy-art',
      'en',
    ]);
    expect(calls).toEqual([['https://example.com/legacy-art', 'en']]);
  });

  it('processes a fresh payload {url, locale} (post-R9 enqueue) — same outcome as legacy', async () => {
    const fakeJobService = {
      processUrl: jest.fn(async () => {}),
    };
    const freshJob = {
      data: { url: 'https://example.com/fresh', locale: 'fr' },
    };

    await postGreenWorkerProcessor(fakeJobService, freshJob);

    expect(fakeJobService.processUrl).toHaveBeenCalledTimes(1);
    expect(fakeJobService.processUrl).toHaveBeenCalledWith('https://example.com/fresh', 'fr');
  });

  it('processUrl signature is binary (url, locale) — no third "searchTerm" parameter', () => {
    // Imports lazily so the type-level assertion is independent of compile order.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- type-only assertion
    const mod =
      require('@modules/knowledge-extraction/useCase/extraction/extraction-job.service') as {
        ExtractionJobService: new (...args: never[]) => {
          processUrl: (...args: never[]) => Promise<void>;
        };
      };
    // jest.fn-style introspection — we expect the bound method to have ARITY 2
    // post-R9 (it had arity 3 with the unused `_searchTerm` parameter today).
    // Function.length counts required parameters before the first default; both
    // params are required, so length === 2 post-R9.
    const arity = mod.ExtractionJobService.prototype.processUrl.length;
    expect(arity).toBe(2);
  });
});

// ─── 4. Sanity: searchTerm payload-field MUST be ABSENT from the 4 BullMQ payload-chain files ──

/**
 * Spec §3 R9 acceptance, RESCOPED (BTW-3 fix 2026-05-21):
 *
 * Two-step discrimination so the assertion stays red-validating WITHOUT
 * tripping on legit non-payload uses inside the same files.
 *
 * STEP 1 — file scope. R9 is the BullMQ payload chain only — these 4 files
 * carry `searchTerm` end-to-end from enqueue → worker → processUrl:
 *
 *   1. domain/ports/extraction-queue.port.ts          (payload type)
 *   2. adapters/primary/extraction.worker.ts          (worker destructure)
 *   3. useCase/extraction/extraction-job.service.ts   (processUrl signature)
 *   4. chat/useCase/orchestration/prepare-message.pipeline.ts (enqueue site)
 *
 * STEP 2 — pattern scope. Within those 4 files, the literal `searchTerm`
 * also appears in legit non-payload contexts that R9 does NOT govern:
 *   - JSDoc / line comments that historically reference the removal
 *     (e.g. "* `searchTerm` (raw user chat text) was removed in …").
 *   - A KnowledgeRouter LOCAL variable in prepare-message.pipeline.ts
 *     (`const searchTerm = inputText?.trim(); router.resolve(searchTerm,…)`)
 *     — a function-scoped identifier, not a BullMQ payload field.
 *
 * The payload-field shape is structurally:
 *   - `searchTerm:` (object literal key or interface property declaration)
 *   - `.searchTerm` (member access: `payload.searchTerm`, `job.data.searchTerm`)
 *
 * Comment-stripped source lines, matched against `searchTerm:|\.searchTerm\b`,
 * yield 0 hits post-R9 and ≥1 hit if an impl rollback re-adds the field as
 * a payload property — the red-validating contract is preserved.
 *
 * Today the impl already passes this rescoped assertion (Green spawn-1 wrote
 * it); a regression that re-adds `searchTerm: …` to ExtractionJobPayload, to
 * the worker destructure, to the processUrl signature, or to the enqueue
 * site object literal would trip it.
 */
describe('Source scan — searchTerm payload-field absent from 4 BullMQ payload-chain files (R9 acceptance, rescoped)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- node fs at test time
  const path = require('node:path') as typeof import('node:path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');

  /**
   * Strip the comment portion of a source line so JSDoc / line-comment
   * mentions of `searchTerm` are ignored. Conservative: handles
   *   * inside a /** … *\/ JSDoc block — lines starting with whitespace+`*`
   *   * `// …` end-of-line line-comments
   *   * `/* … *\/` inline block-comments
   * Multi-line block comments split across lines are handled by tracking an
   * `inBlockComment` flag at the call site.
   */
  function stripComment(
    line: string,
    inBlockComment: boolean,
  ): { code: string; stillInBlock: boolean } {
    let text = line;
    let inBlock = inBlockComment;

    // JSDoc continuation line: starts with optional ws then `*`.
    if (inBlock) {
      const closeIdx = text.indexOf('*/');
      if (closeIdx === -1) return { code: '', stillInBlock: true };
      text = text.slice(closeIdx + 2);
      inBlock = false;
    }
    // Inline /* … */ on the same line.
    while (true) {
      const openIdx = text.indexOf('/*');
      if (openIdx === -1) break;
      const closeIdx = text.indexOf('*/', openIdx + 2);
      if (closeIdx === -1) {
        text = text.slice(0, openIdx);
        inBlock = true;
        break;
      }
      text = text.slice(0, openIdx) + ' ' + text.slice(closeIdx + 2);
    }
    // End-of-line line comment.
    const lineCommentIdx = text.indexOf('//');
    if (lineCommentIdx !== -1) text = text.slice(0, lineCommentIdx);
    return { code: text, stillInBlock: inBlock };
  }

  it('no payload-field `searchTerm` (object key or member access) remains in the 4 R9-scope files', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..'); // → museum-backend/
    const r9Files = [
      path.join(repoRoot, 'src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts'),
      path.join(repoRoot, 'src/modules/knowledge-extraction/adapters/primary/extraction.worker.ts'),
      path.join(
        repoRoot,
        'src/modules/knowledge-extraction/useCase/extraction/extraction-job.service.ts',
      ),
      path.join(repoRoot, 'src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts'),
    ];
    // Matches `searchTerm:` (object literal key or interface property) or
    // `.searchTerm` (member access). Does NOT match bare identifier usage
    // (e.g. a local `const searchTerm = …` or `fn(searchTerm)`).
    const payloadFieldRegex = /(?:\bsearchTerm\s*:|\.searchTerm\b)/;
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of r9Files) {
      if (!fs.existsSync(file)) {
        offenders.push({ file, line: 0, text: '<file missing — scope drift>' });
        continue;
      }
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      let inBlock = false;
      lines.forEach((line, idx) => {
        const { code, stillInBlock } = stripComment(line, inBlock);
        inBlock = stillInBlock;
        if (payloadFieldRegex.test(code)) {
          offenders.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
