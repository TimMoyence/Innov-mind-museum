/**
 * NL-4.6 benchmark — runs the canonical prompts dataset through one or more
 * AdvancedGuardrail adapters and prints a comparison table.
 *
 * Usage:
 *   pnpm exec tsx scripts/benchmark-guardrails.ts noop
 *   pnpm exec tsx scripts/benchmark-guardrails.ts llm-guard --url http://localhost:8081
 *   pnpm exec tsx scripts/benchmark-guardrails.ts llm-guard noop --output reports/bench.json
 *
 * Fail-CLOSED: any adapter throw is recorded as allow=false / reason='error'.
 * No mock — pass 'noop' to smoke-test the harness without a sidecar.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { LLMGuardAdapter } from '../src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter';
import { noopAdvancedGuardrail } from '../src/modules/chat/domain/ports/advanced-guardrail.port';

import type {
  AdvancedGuardrail,
  AdvancedGuardrailDecision,
} from '../src/modules/chat/domain/ports/advanced-guardrail.port';

interface DatasetPrompt {
  id: string;
  category: string;
  locale: string;
  text: string;
  expectedDecision: 'allow' | 'block' | 'redact';
  expectedReason?: string;
}

interface DatasetFile {
  _metadata: { totalPrompts: number; categories: Record<string, number> };
  prompts: DatasetPrompt[];
}

interface Measurement {
  promptId: string;
  category: string;
  expectedDecision: string;
  actualAllow: boolean;
  actualReason?: string;
  latencyMs: number;
  error?: string;
}

interface AggregateReport {
  adapter: string;
  total: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  errors: number;
  latency: { p50: number; p95: number; p99: number; mean: number };
  perCategory: Record<string, { total: number; correct: number; accuracy: number }>;
}

const DATASET_PATH = path.resolve(__dirname, '..', 'tests', 'fixtures', 'guardrails-dataset.json');

/** Percentile (p between 0 and 100) over a non-empty array of numbers. */
const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
};

/**
 * An expected decision of 'allow' maps to allow=true.
 * 'block' and 'redact' both map to allow=false (redact is a softer block: the
 * adapter returned sanitized text instead of the original).
 */
const expectedToAllow = (expected: string): boolean => expected === 'allow';

/** Ground-truth comparison: adapter 'allow' vs expected 'allow'. */
const classify = (
  expected: string,
  actualAllow: boolean,
): 'TP' | 'FP' | 'TN' | 'FN' => {
  const expectedAllow = expectedToAllow(expected);
  if (expectedAllow && actualAllow) return 'TN'; // correctly let it through
  if (!expectedAllow && !actualAllow) return 'TP'; // correctly blocked
  if (expectedAllow && !actualAllow) return 'FP'; // wrongly blocked (over-blocking)
  return 'FN'; // wrongly allowed (missed block)
};

async function runOne(
  adapter: AdvancedGuardrail,
  prompt: DatasetPrompt,
): Promise<Measurement> {
  const start = performance.now();
  let decision: AdvancedGuardrailDecision;
  let error: string | undefined;
  try {
    decision = await adapter.checkInput({ text: prompt.text, locale: prompt.locale });
  } catch (err) {
    decision = { allow: false, reason: 'error' };
    error = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = performance.now() - start;
  return {
    promptId: prompt.id,
    category: prompt.category,
    expectedDecision: prompt.expectedDecision,
    actualAllow: decision.allow,
    actualReason: decision.reason,
    latencyMs,
    error,
  };
}

async function benchmark(
  name: string,
  adapter: AdvancedGuardrail,
  prompts: DatasetPrompt[],
): Promise<AggregateReport> {
  const measurements: Measurement[] = [];
  for (const prompt of prompts) {
    // Sequential to make P95 meaningful even with a slow sidecar; use concurrency
    // knobs only once the single-request behaviour is understood.
    // eslint-disable-next-line no-await-in-loop -- sequential timing is the design
    measurements.push(await runOne(adapter, prompt));
  }

  const latencies = measurements.map((m) => m.latencyMs).sort((a, b) => a - b);
  const mean = latencies.reduce((s, v) => s + v, 0) / Math.max(1, latencies.length);
  const errors = measurements.filter((m) => m.error).length;

  let truePositives = 0,
    falsePositives = 0,
    trueNegatives = 0,
    falseNegatives = 0;
  const perCategory: Record<string, { total: number; correct: number; accuracy: number }> = {};

  for (const m of measurements) {
    const verdict = classify(m.expectedDecision, m.actualAllow);
    if (verdict === 'TP') truePositives += 1;
    else if (verdict === 'FP') falsePositives += 1;
    else if (verdict === 'TN') trueNegatives += 1;
    else falseNegatives += 1;

    const cat = (perCategory[m.category] ??= { total: 0, correct: 0, accuracy: 0 });
    cat.total += 1;
    if (verdict === 'TP' || verdict === 'TN') cat.correct += 1;
  }

  for (const cat of Object.values(perCategory)) {
    cat.accuracy = cat.total === 0 ? 0 : cat.correct / cat.total;
  }

  return {
    adapter: name,
    total: prompts.length,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    errors,
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      mean,
    },
    perCategory,
  };
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);
const ms = (n: number): string => `${n.toFixed(1)}ms`;

const formatReport = (report: AggregateReport): string => {
  const lines: string[] = [];
  lines.push(`\n=== ${report.adapter} ===`);
  lines.push(`total=${String(report.total)} errors=${String(report.errors)}`);
  lines.push(
    `TP=${String(report.truePositives)}  FP=${String(report.falsePositives)}  TN=${String(report.trueNegatives)}  FN=${String(report.falseNegatives)}`,
  );
  const blocksExpected = report.truePositives + report.falseNegatives;
  const allowsExpected = report.trueNegatives + report.falsePositives;
  lines.push(
    `detect_rate=${pct(report.truePositives, blocksExpected)}   false_positive_rate=${pct(report.falsePositives, allowsExpected)}`,
  );
  lines.push(
    `latency: p50=${ms(report.latency.p50)}  p95=${ms(report.latency.p95)}  p99=${ms(report.latency.p99)}  mean=${ms(report.latency.mean)}`,
  );
  lines.push('per-category accuracy:');
  for (const [cat, stat] of Object.entries(report.perCategory)) {
    lines.push(`  ${cat.padEnd(20)}  ${pct(stat.correct, stat.total)}  (${String(stat.correct)}/${String(stat.total)})`);
  }
  return lines.join('\n');
};

interface CliArgs {
  adapters: string[];
  llmGuardUrl: string;
  timeoutMs: number;
  outputPath?: string;
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    adapters: [],
    llmGuardUrl: process.env.GUARDRAILS_V2_LLM_GUARD_URL ?? 'http://localhost:8081',
    timeoutMs: 1500,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--url' && argv[i + 1]) {
      args.llmGuardUrl = argv[i + 1];
      i += 1;
    } else if (token === '--timeout' && argv[i + 1]) {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (token === '--output' && argv[i + 1]) {
      args.outputPath = argv[i + 1];
      i += 1;
    } else if (!token.startsWith('--')) {
      args.adapters.push(token);
    }
  }
  if (args.adapters.length === 0) args.adapters.push('noop');
  return args;
};

const buildAdapter = (name: string, args: CliArgs): AdvancedGuardrail => {
  if (name === 'noop') return noopAdvancedGuardrail;
  if (name === 'llm-guard') {
    return new LLMGuardAdapter({ baseUrl: args.llmGuardUrl, timeoutMs: args.timeoutMs });
  }
  throw new Error(`Unknown adapter: ${name}. Supported: noop, llm-guard.`);
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const datasetRaw = await fs.readFile(DATASET_PATH, 'utf8');
  const dataset = JSON.parse(datasetRaw) as DatasetFile;

  console.error(
    `Loaded ${String(dataset.prompts.length)} prompts across ${String(
      Object.keys(dataset._metadata.categories).length,
    )} categories.`,
  );

  const reports: AggregateReport[] = [];
  for (const name of args.adapters) {
    const adapter = buildAdapter(name, args);
    console.error(`Running adapter: ${name}`);
    // eslint-disable-next-line no-await-in-loop -- adapters benchmarked sequentially
    reports.push(await benchmark(name, adapter, dataset.prompts));
  }

  for (const report of reports) {
    console.log(formatReport(report));
  }

  if (args.outputPath) {
    const absolute = path.resolve(args.outputPath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
    console.error(`\nReport saved to ${absolute}`);
  }
}

// CLI entry point. When imported as a module (e.g. from a Jest smoke test),
// the main() call is skipped so exports stay pure.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('benchmark failed:', error);
    process.exit(1);
  });
}

export { benchmark, formatReport, parseArgs, percentile, classify, expectedToAllow };
export type { AggregateReport, Measurement, DatasetPrompt };
