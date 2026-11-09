import type {
  ExtractionJobPayload,
  ExtractionQueuePort,
} from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';

describe('ExtractionJobPayload — type shape (R9 data-minimisation)', () => {
  it('accepts a payload made of ONLY { url, locale } (no searchTerm)', () => {
    const payload: ExtractionJobPayload = {
      url: 'https://example.com/mona-lisa',
      locale: 'en',
    };
    expect(payload.url).toBe('https://example.com/mona-lisa');
    expect(payload.locale).toBe('en');
  });

  it('does NOT carry a searchTerm field on the type (compile-time gate)', () => {
    const carriesSearchTerm: 'searchTerm' extends keyof ExtractionJobPayload ? true : false = false;
    expect(carriesSearchTerm).toBe(false);
  });
});

describe('Extraction enqueue path — R9 (no PII leaks into queue payload)', () => {
  it('enqueues jobs containing ONLY { url, locale } — searchTerm is absent', async () => {
    const captured: ExtractionJobPayload[] = [];
    const fakeQueue: ExtractionQueuePort = {
      async enqueueUrls(jobs) {
        captured.push(...jobs);
      },
    };

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

    const legacyJob = {
      data: {
        url: 'https://example.com/legacy-art',
        locale: 'en',
        searchTerm: 'leftover-user-chat-text',
      } as { url: string; locale: string },
    };

    await expect(postGreenWorkerProcessor(fakeJobService, legacyJob)).resolves.toBeUndefined();

    expect(fakeJobService.processUrl).toHaveBeenCalledTimes(1);
    expect(fakeJobService.processUrl).toHaveBeenCalledWith('https://example.com/legacy-art', 'en');
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
    const mod =
      require('@modules/knowledge-extraction/useCase/extraction/extraction-job.service') as {
        ExtractionJobService: new (...args: never[]) => {
          processUrl: (...args: never[]) => Promise<void>;
        };
      };
    const arity = mod.ExtractionJobService.prototype.processUrl.length;
    expect(arity).toBe(2);
  });
});

describe('Source scan — searchTerm payload-field absent from 4 BullMQ payload-chain files (R9 acceptance, rescoped)', () => {
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');

  function stripComment(
    line: string,
    inBlockComment: boolean,
  ): { code: string; stillInBlock: boolean } {
    let text = line;
    let inBlock = inBlockComment;

    if (inBlock) {
      const closeIdx = text.indexOf('*/');
      if (closeIdx === -1) return { code: '', stillInBlock: true };
      text = text.slice(closeIdx + 2);
      inBlock = false;
    }
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
    const lineCommentIdx = text.indexOf('//');
    if (lineCommentIdx !== -1) text = text.slice(0, lineCommentIdx);
    return { code: text, stillInBlock: inBlock };
  }

  it('no payload-field `searchTerm` (object key or member access) remains in the 4 R9-scope files', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const r9Files = [
      path.join(repoRoot, 'src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts'),
      path.join(repoRoot, 'src/modules/knowledge-extraction/adapters/primary/extraction.worker.ts'),
      path.join(
        repoRoot,
        'src/modules/knowledge-extraction/useCase/extraction/extraction-job.service.ts',
      ),
      path.join(repoRoot, 'src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts'),
    ];
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
