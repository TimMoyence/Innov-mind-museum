#!/usr/bin/env node
/**
 * Sentinel: metric-naming (TD-PC-03)
 *
 * Ratchets the Prometheus metric-naming conventions over the registry source
 * `museum-backend/src/shared/observability/prometheus-metrics.ts`.
 *
 * It does NOT rename anything — renames break the Grafana dashboards / alert
 * rules that still query the old name (see docs/observability/METRIC_NAMING_AUDIT.md
 * §4) and are deferred to a coordinated follow-up PR. This sentinel locks the
 * current status quo so that:
 *
 *   R1  every metric name is lowercase snake_case          ^[a-z][a-z0-9_]*$
 *   R2  every Counter name ends in `_total`
 *   R3  every Histogram name ends in `_seconds`            (grandfather: GRANDFATHERED_HISTOGRAMS)
 *   F2  the count of `musaium_`-prefixed metrics does not GROW beyond the
 *       frozen ceiling (nudges new metrics to the bare subsystem convention)
 *   FREEZE  the exact inventory of metric names is pinned; any add / remove /
 *           rename fails here, forcing the rename plan to be a deliberate review
 *           that updates this sentinel + the audit + the dashboards together.
 *
 * Reference: docs/observability/METRIC_NAMING_AUDIT.md.
 * Exit 0 = pass · 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(
  repoRoot,
  'museum-backend',
  'src',
  'shared',
  'observability',
  'prometheus-metrics.ts',
);
const AUDIT = 'docs/observability/METRIC_NAMING_AUDIT.md';

// ── Frozen contract (TD-PC-03 audit 2026-05-20) ─────────────────────────────
// The exact inventory of application metric names, by prom-client type. Updating
// any of these sets is a DELIBERATE act: it must accompany a rename PR that also
// edits the dashboards listed in the audit §4. See audit §5/§6.
const EXPECTED = {
  Counter: [
    'http_requests_total',
    'llm_cache_hits_total',
    'llm_cache_misses_total',
    'chat_phase_errors_total',
    'chat_enrichment_source_calls_total',
    'chat_sources_emitted_total',
    'chat_sources_rejected_total',
    'chat_websearch_fallback_total',
    'chat_url_head_probe_total',
    'compare_requests_total',
    'compare_fallback_total',
    'compare_cache_hits_total',
    'wikidata_sparql_requests_total',
    'wikidata_cache_hits_total',
    'wikidata_cache_misses_total',
    'wikidata_local_dump_hits_total',
    'wikidata_local_dump_misses_total',
    'geo_detect_museum_total',
    'nominatim_requests_total',
    'musaium_llm_guard_circuit_breaker_trips_total',
    'musaium_llm_guard_circuit_breaker_skips_total',
    'musaium_llm_guard_chaos_injections_total',
    'musaium_guardrail_budget_redis_fallback_total',
    'musaium_llm_cost_circuit_breaker_trips_total',
    'musaium_tenant_rate_limit_rejects_total',
    'musaium_guardrail_decisions_total',
    'musaium_guardrail_category_blocks_total',
    'musaium_guardrail_pii_redacted_total',
    'musaium_rerank_fallback_total',
    'musaium_llm_prompt_cache_hits_total',
  ],
  Histogram: [
    'http_request_duration_seconds',
    'chat_phase_duration_seconds',
    'chat_request_duration_seconds',
    'chat_enrichment_source_latency_seconds',
    'compare_duration_seconds',
    'wikidata_sparql_request_duration_seconds',
    'musaium_llm_guard_scan_duration_seconds',
    'nominatim_request_duration_seconds',
    'musaium_rerank_latency_ms', // F1 known debt — grandfathered below
  ],
  Gauge: [
    'artwork_embeddings_count',
    'wikidata_sparql_circuit_state',
    'musaium_llm_guard_circuit_breaker_state',
    'musaium_llm_cost_circuit_breaker_state',
    'musaium_llm_cost_eur_per_hour',
  ],
};

// Histograms allowed to NOT end in `_seconds` (documented base-unit debt, F1).
// This set must SHRINK over time, never grow. It exists so the violation is
// visible as known debt rather than silently passing R3.
const GRANDFATHERED_HISTOGRAMS = new Set(['musaium_rerank_latency_ms']);

// F2 prefix ratchet ceiling: number of `musaium_`-prefixed metrics today.
// The target convention (audit F2 Option A) is bare subsystem prefixes, so this
// count must only ever DECREASE.
const MUSAIUM_PREFIX_CEILING = 16;

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

// ── Parse the source: pair each `new Counter|Histogram|Gauge({` with the first
// `name: '...'` that follows it. The file declares one metric per constructor. ──
function parseMetrics(src) {
  const ctorRe = /new\s+(Counter|Histogram|Gauge)\s*\(/g;
  const found = [];
  let m;
  while ((m = ctorRe.exec(src)) !== null) {
    const type = m[1];
    const after = src.slice(m.index, m.index + 600);
    const nameMatch = after.match(/name:\s*['"`]([^'"`]+)['"`]/);
    if (!nameMatch) {
      found.push({ type, name: null, raw: after.slice(0, 60) });
      continue;
    }
    found.push({ type, name: nameMatch[1] });
  }
  return found;
}

function fail(lines) {
  console.error('[sentinel:metric-naming] FAIL');
  for (const l of lines) console.error('  - ' + l);
  console.error(`\n  See ${AUDIT} (§5 sentinel contract, §6 rename plan).`);
  console.error(
    '  If you intentionally added/renamed a metric, update BOTH this sentinel\n' +
      '  (EXPECTED set) AND the audit tables in the same PR — and the dashboards\n' +
      '  in audit §4 if you renamed an existing one.',
  );
  process.exit(1);
}

if (!fs.existsSync(SOURCE)) {
  fail([`registry source not found: ${path.relative(repoRoot, SOURCE)}`]);
}

const src = fs.readFileSync(SOURCE, 'utf8');
const metrics = parseMetrics(src);
const errors = [];

// Sanity: a parse that finds zero metrics means the regex drifted from the file.
if (metrics.length === 0) {
  fail(['parsed 0 metrics — the source format changed and the parser drifted.']);
}

// Per-metric structural checks (R1/R2/R3).
for (const { type, name, raw } of metrics) {
  if (name === null) {
    errors.push(`a ${type} declaration has no parseable name (near "${raw}…")`);
    continue;
  }
  if (!SNAKE_CASE.test(name)) {
    errors.push(`R1 snake_case violation: "${name}" (${type})`);
  }
  if (type === 'Counter' && !name.endsWith('_total')) {
    errors.push(`R2 counter must end in _total: "${name}"`);
  }
  if (
    type === 'Histogram' &&
    !name.endsWith('_seconds') &&
    !GRANDFATHERED_HISTOGRAMS.has(name)
  ) {
    errors.push(
      `R3 duration histogram must use base unit _seconds: "${name}"` +
        ` (add to GRANDFATHERED_HISTOGRAMS only with an audit entry)`,
    );
  }
}

// Inventory freeze (FREEZE): observed set === expected set, per type.
const observedByType = { Counter: [], Histogram: [], Gauge: [] };
for (const { type, name } of metrics) {
  if (name && observedByType[type]) observedByType[type].push(name);
}
for (const type of ['Counter', 'Histogram', 'Gauge']) {
  const expected = new Set(EXPECTED[type]);
  const observed = new Set(observedByType[type]);
  for (const name of observed) {
    if (!expected.has(name)) {
      errors.push(`FREEZE: new/renamed ${type} not in frozen inventory: "${name}"`);
    }
  }
  for (const name of expected) {
    if (!observed.has(name)) {
      errors.push(
        `FREEZE: expected ${type} "${name}" missing from registry (removed or renamed?)`,
      );
    }
  }
}

// F2 prefix ratchet: musaium_ count must not grow.
const musaiumCount = metrics.filter((x) => x.name?.startsWith('musaium_')).length;
if (musaiumCount > MUSAIUM_PREFIX_CEILING) {
  errors.push(
    `F2 prefix ratchet: ${musaiumCount} musaium_-prefixed metrics exceeds ceiling ` +
      `${MUSAIUM_PREFIX_CEILING}. Target convention is bare subsystem prefixes — ` +
      `new metrics must NOT add the musaium_ prefix.`,
  );
}

if (errors.length > 0) fail(errors);

const grandfathered = metrics.filter(
  (x) => x.name && GRANDFATHERED_HISTOGRAMS.has(x.name),
).length;
console.log(
  `[sentinel:metric-naming] PASS — ${metrics.length} metrics ` +
    `(${musaiumCount} musaium_-prefixed / ceiling ${MUSAIUM_PREFIX_CEILING}, ` +
    `${grandfathered} grandfathered base-unit debt). See ${AUDIT}.`,
);
process.exit(0);
