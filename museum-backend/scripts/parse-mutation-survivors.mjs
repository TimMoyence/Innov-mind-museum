#!/usr/bin/env node
/**
 * Parse reports/mutation/mutation.json and emit:
 *  - kill ratio overall
 *  - top files by survivor count
 *  - per-file survivor list (line + mutation kind + replacement)
 *
 * Usage: node /tmp/parse-mutation-survivors.mjs <path/to/mutation.json>
 */
import { readFileSync } from 'fs';

const reportPath = process.argv[2] ?? 'reports/mutation/mutation.json';
const raw = JSON.parse(readFileSync(reportPath, 'utf-8'));

const files = raw.files ?? {};
let total = 0, killed = 0, survived = 0, timedOut = 0, noCoverage = 0, runtimeError = 0, ignored = 0;
const survivorsByFile = {};

for (const [path, data] of Object.entries(files)) {
  for (const m of data.mutants ?? []) {
    total++;
    switch (m.status) {
      case 'Killed': killed++; break;
      case 'Survived':
        survived++;
        (survivorsByFile[path] ??= []).push(m);
        break;
      case 'Timeout': timedOut++; break;
      case 'NoCoverage':
        noCoverage++;
        (survivorsByFile[path] ??= []).push({ ...m, status: 'NoCoverage' });
        break;
      case 'RuntimeError': runtimeError++; break;
      case 'Ignored': ignored++; break;
    }
  }
}

const score = total === 0 ? 0 : ((killed + timedOut) / (total - ignored - noCoverage)) * 100;
const scoreCovered = total === 0 ? 0 : ((killed + timedOut) / total) * 100;

console.log('═══ MUTATION REPORT SUMMARY ═══');
console.log(`Total mutants:    ${total}`);
console.log(`Killed:           ${killed}`);
console.log(`Survived:         ${survived}`);
console.log(`Timeout (killed): ${timedOut}`);
console.log(`NoCoverage:       ${noCoverage}`);
console.log(`RuntimeError:     ${runtimeError}`);
console.log(`Ignored:          ${ignored}`);
console.log(`Score (covered):  ${scoreCovered.toFixed(2)}%  ← excludes NoCoverage`);
console.log(`Score (Stryker):  ${score.toFixed(2)}%  ← official mutationScore`);
console.log('');

console.log('═══ TOP 15 FILES BY SURVIVOR COUNT ═══');
const ranked = Object.entries(survivorsByFile)
  .map(([f, arr]) => [f, arr.length, arr.filter(m => m.status === 'Survived').length, arr.filter(m => m.status === 'NoCoverage').length])
  .sort((a, b) => b[1] - a[1]);
for (const [f, total, surv, nocov] of ranked.slice(0, 15)) {
  console.log(`  ${total.toString().padStart(4)}  (S=${surv} NC=${nocov})  ${f}`);
}

console.log('');
console.log('═══ TOP 5 FILES — DETAIL ═══');
for (const [f, _t, _s, _n] of ranked.slice(0, 5)) {
  console.log(`\n--- ${f} ---`);
  const mutants = survivorsByFile[f].sort((a, b) => (a.location?.start?.line ?? 0) - (b.location?.start?.line ?? 0));
  for (const m of mutants) {
    const line = m.location?.start?.line ?? '?';
    const col = m.location?.start?.column ?? '?';
    const kind = m.mutatorName ?? '?';
    const replacement = (m.replacement ?? '').slice(0, 60).replace(/\s+/g, ' ');
    console.log(`  L${line}:${col}  [${m.status}] ${kind} → ${replacement}`);
  }
}
