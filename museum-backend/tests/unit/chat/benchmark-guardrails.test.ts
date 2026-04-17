import { noopAdvancedGuardrail } from '@modules/chat/domain/ports/advanced-guardrail.port';

import {
  benchmark,
  classify,
  expectedToAllow,
  parseArgs,
  percentile,
} from '../../../scripts/benchmark-guardrails';

import type { DatasetPrompt } from '../../../scripts/benchmark-guardrails';

describe('benchmark-guardrails helpers', () => {
  describe('expectedToAllow', () => {
    it('returns true only for "allow"', () => {
      expect(expectedToAllow('allow')).toBe(true);
      expect(expectedToAllow('block')).toBe(false);
      expect(expectedToAllow('redact')).toBe(false);
    });
  });

  describe('classify', () => {
    it('marks an expected allow that was allowed as TN', () => {
      expect(classify('allow', true)).toBe('TN');
    });
    it('marks an expected block that was blocked as TP', () => {
      expect(classify('block', false)).toBe('TP');
    });
    it('marks a wrongly blocked allowance as FP', () => {
      expect(classify('allow', false)).toBe('FP');
    });
    it('marks a missed block as FN', () => {
      expect(classify('block', true)).toBe('FN');
    });
  });

  describe('percentile', () => {
    it('returns 0 for empty arrays', () => {
      expect(percentile([], 50)).toBe(0);
    });
    it('returns p50 correctly on sorted input', () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });
    it('clamps to the last element for p>=100', () => {
      expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    });
  });

  describe('parseArgs', () => {
    it('defaults to noop when no adapter provided', () => {
      const args = parseArgs([]);
      expect(args.adapters).toEqual(['noop']);
    });
    it('collects positional adapters', () => {
      const args = parseArgs(['noop', 'llm-guard']);
      expect(args.adapters).toEqual(['noop', 'llm-guard']);
    });
    it('parses --url, --timeout, --output', () => {
      const args = parseArgs([
        'llm-guard',
        '--url',
        'http://host:9000',
        '--timeout',
        '500',
        '--output',
        '/tmp/bench.json',
      ]);
      expect(args.adapters).toEqual(['llm-guard']);
      expect(args.llmGuardUrl).toBe('http://host:9000');
      expect(args.timeoutMs).toBe(500);
      expect(args.outputPath).toBe('/tmp/bench.json');
    });
  });
});

describe('benchmark end-to-end on a small dataset', () => {
  const prompts: DatasetPrompt[] = [
    { id: 'a1', category: 'benign_art', locale: 'en', text: 'ok', expectedDecision: 'allow' },
    { id: 'a2', category: 'benign_art', locale: 'en', text: 'ok2', expectedDecision: 'allow' },
    { id: 'i1', category: 'injection_owasp', locale: 'en', text: 'bad', expectedDecision: 'block' },
  ];

  it('noop adapter yields 100% allow → FP for expected blocks, TN for allows', async () => {
    const report = await benchmark('noop', noopAdvancedGuardrail, prompts);

    expect(report.total).toBe(3);
    expect(report.trueNegatives).toBe(2);
    expect(report.falseNegatives).toBe(1);
    expect(report.truePositives).toBe(0);
    expect(report.falsePositives).toBe(0);
    expect(report.errors).toBe(0);
    expect(report.perCategory.benign_art.accuracy).toBe(1);
    expect(report.perCategory.injection_owasp.accuracy).toBe(0);
  });

  it('adapter that blocks everything yields TP for blocks and FP for allows', async () => {
    const blockAll = {
      name: 'block-all',
      checkInput: async () => ({ allow: false, reason: 'prompt_injection' as const }),
      checkOutput: async () => ({ allow: true }),
    };

    const report = await benchmark('block-all', blockAll, prompts);

    expect(report.truePositives).toBe(1);
    expect(report.falsePositives).toBe(2);
    expect(report.falseNegatives).toBe(0);
  });

  it('records errors when adapter throws but still produces a report', async () => {
    const throwingAdapter = {
      name: 'throws',
      checkInput: async () => {
        throw new Error('boom');
      },
      checkOutput: async () => ({ allow: true }),
    };

    const report = await benchmark('throws', throwingAdapter, prompts);

    expect(report.errors).toBe(3);
    // Throws are treated as allow=false → TP for blocks, FP for allows.
    expect(report.truePositives + report.falsePositives).toBe(3);
  });
});
