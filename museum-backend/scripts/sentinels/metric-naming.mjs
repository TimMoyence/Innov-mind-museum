#!/usr/bin/env node
// @ts-check
/**
 * TD-PC-03 — Prometheus metric-naming ratchet (companion to
 * docs/observability/METRIC_NAMING_AUDIT.md). AUDIT-ONLY: this script renames
 * nothing. It locks the current registry so naming drift becomes a deliberate,
 * reviewed change (the eventual rename PR must update this frozen set + the
 * audit doc + the dashboards together).
 *
 * Enforces (audit §5):
 *   R1 — every metric `name:` matches ^[a-z][a-z0-9_]*$ (snake_case).
 *   R2 — every Counter name ends in `_total`.
 *   R3 — every Histogram name ends in `_seconds`, EXCEPT the grandfathered
 *        `musaium_rerank_latency_ms` (F1 known debt — listed explicitly).
 *   Inventory freeze — the exact 44 (type,name) pairs are pinned.
 *   Prefix ratchet — `musaium_`-prefixed count must not exceed 16 (F2: nudge
 *        new metrics toward the bare-prefix target convention).
 *
 * Run: pnpm sentinel:metric-naming  (exit 0 = pass, 1 = regression)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../src/shared/observability/prometheus-metrics.ts');

/** F1 — the single grandfathered duration histogram still in milliseconds. */
const GRANDFATHERED_MS = 'musaium_rerank_latency_ms';

/** Audit §2 frozen inventory: 44 (type,name) pairs, post-W1+W3 merge. */
const FROZEN = [
  ['Counter', 'http_requests_total'],
  ['Histogram', 'http_request_duration_seconds'],
  ['Counter', 'llm_cache_hits_total'],
  ['Counter', 'llm_cache_misses_total'],
  ['Histogram', 'chat_phase_duration_seconds'],
  ['Histogram', 'chat_request_duration_seconds'],
  ['Counter', 'chat_phase_errors_total'],
  ['Counter', 'chat_enrichment_source_calls_total'],
  ['Histogram', 'chat_enrichment_source_latency_seconds'],
  ['Counter', 'compare_requests_total'],
  ['Histogram', 'compare_duration_seconds'],
  ['Counter', 'compare_fallback_total'],
  ['Counter', 'compare_cache_hits_total'],
  ['Gauge', 'artwork_embeddings_count'],
  ['Gauge', 'wikidata_sparql_circuit_state'],
  ['Counter', 'wikidata_sparql_requests_total'],
  ['Histogram', 'wikidata_sparql_request_duration_seconds'],
  ['Counter', 'wikidata_cache_hits_total'],
  ['Counter', 'wikidata_cache_misses_total'],
  ['Counter', 'wikidata_local_dump_hits_total'],
  ['Counter', 'wikidata_local_dump_misses_total'],
  ['Gauge', 'musaium_llm_guard_circuit_breaker_state'],
  ['Counter', 'musaium_llm_guard_circuit_breaker_trips_total'],
  ['Counter', 'musaium_llm_guard_circuit_breaker_skips_total'],
  ['Histogram', 'musaium_llm_guard_scan_duration_seconds'],
  ['Counter', 'chat_sources_emitted_total'],
  ['Counter', 'chat_sources_rejected_total'],
  ['Counter', 'chat_websearch_fallback_total'],
  ['Counter', 'chat_url_head_probe_total'],
  ['Counter', 'musaium_guardrail_budget_redis_fallback_total'],
  ['Gauge', 'musaium_llm_cost_circuit_breaker_state'],
  ['Counter', 'musaium_llm_cost_circuit_breaker_trips_total'],
  ['Gauge', 'musaium_llm_cost_eur_per_hour'],
  ['Counter', 'musaium_tenant_rate_limit_rejects_total'],
  ['Counter', 'musaium_guardrail_decisions_total'],
  ['Counter', 'musaium_guardrail_category_blocks_total'],
  ['Counter', 'musaium_guardrail_pii_redacted_total'],
  ['Counter', 'musaium_llm_guard_chaos_injections_total'],
  ['Counter', 'geo_detect_museum_total'],
  ['Counter', 'nominatim_requests_total'],
  ['Histogram', 'nominatim_request_duration_seconds'],
  ['Histogram', 'musaium_rerank_latency_ms'],
  ['Counter', 'musaium_rerank_fallback_total'],
  ['Counter', 'musaium_llm_prompt_cache_hits_total'],
];
const MAX_MUSAIUM_PREFIXED = 16;

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const METRIC_RE =
  /new\s+(Counter|Gauge|Histogram|Summary)\s*(?:<[^>]*>)?\s*\(\s*\{[\s\S]*?name:\s*'([^']+)'/g;

function parseRegistry(src) {
  /** @type {{type:string,name:string}[]} */
  const out = [];
  let m;
  while ((m = METRIC_RE.exec(src))) out.push({ type: m[1], name: m[2] });
  return out;
}

function main() {
  const src = readFileSync(SRC, 'utf8');
  const found = parseRegistry(src);
  const errors = [];

  // R1 / R2 / R3 — per-metric rules.
  for (const { type, name } of found) {
    if (!NAME_RE.test(name)) {
      errors.push(`R1 snake_case violation: '${name}' (must match ${NAME_RE}).`);
    }
    if (type === 'Counter' && !name.endsWith('_total')) {
      errors.push(`R2 counter '${name}' must end in '_total'.`);
    }
    if (type === 'Histogram' && !name.endsWith('_seconds') && name !== GRANDFATHERED_MS) {
      errors.push(
        `R3 histogram '${name}' must use base unit '_seconds' (only '${GRANDFATHERED_MS}' is grandfathered — see audit F1).`,
      );
    }
  }

  // Inventory freeze — exact set match against FROZEN.
  const foundKey = new Set(found.map((f) => `${f.type}::${f.name}`));
  const frozenKey = new Set(FROZEN.map(([t, n]) => `${t}::${n}`));
  for (const k of frozenKey) {
    if (!foundKey.has(k))
      errors.push(`Inventory freeze: expected metric removed/renamed → '${k}'.`);
  }
  for (const k of foundKey) {
    if (!frozenKey.has(k))
      errors.push(
        `Inventory freeze: NEW/renamed metric '${k}' not in the frozen set. If intentional, update scripts/sentinels/metric-naming.mjs FROZEN + docs/observability/METRIC_NAMING_AUDIT.md §2 in the same PR.`,
      );
  }

  // Prefix ratchet — musaium_ count must not grow (F2 nudge toward bare).
  const musaiumCount = found.filter((f) => f.name.startsWith('musaium_')).length;
  if (musaiumCount > MAX_MUSAIUM_PREFIXED) {
    errors.push(
      `Prefix ratchet: ${musaiumCount} 'musaium_'-prefixed metrics > cap ${MAX_MUSAIUM_PREFIXED}. New metrics should use a bare subsystem prefix (audit F2 Option A).`,
    );
  }

  if (errors.length > 0) {
    console.error(`[sentinel:metric-naming] FAIL — ${errors.length} issue(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `[sentinel:metric-naming] PASS — ${found.length} metrics, ${musaiumCount}/${MAX_MUSAIUM_PREFIXED} musaium_-prefixed, R1/R2/R3 + inventory freeze OK.`,
  );
}

main();
