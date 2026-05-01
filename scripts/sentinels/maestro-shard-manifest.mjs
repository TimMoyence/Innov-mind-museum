#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 2 sentinel: every Maestro flow file under museum-frontend/.maestro/
 * (excluding config.yaml and helpers/) MUST be listed in exactly one shard
 * of museum-frontend/.maestro/shards.json.
 *
 * Exit codes:
 *   0 — every flow is in exactly one shard, every shard reference exists on disk
 *   1 — at least one flow missing, duplicated, or phantom
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = process.env.MAESTRO_REPO_ROOT
  ? resolve(process.env.MAESTRO_REPO_ROOT)
  : resolve(__dirname, '..', '..');
const MAESTRO_DIR = resolve(REPO_ROOT, 'museum-frontend/.maestro');
const MANIFEST_PATH = resolve(MAESTRO_DIR, 'shards.json');

function listFlowFiles() {
  const out = [];
  for (const entry of readdirSync(MAESTRO_DIR)) {
    const full = join(MAESTRO_DIR, entry);
    if (!statSync(full).isFile()) continue;
    if (!entry.endsWith('.yaml')) continue;
    out.push(entry);
  }
  return out;
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (err) {
    console.error(`Cannot read shard manifest at ${MANIFEST_PATH}: ${err.message}`);
    process.exit(1);
  }

  const excluded = new Set(manifest.excluded ?? []);
  const onDisk = listFlowFiles().filter((f) => !excluded.has(f));

  const inShards = manifest.shards.flatMap((s) => s.flows);
  const seen = new Map();
  const duplicates = [];
  for (const f of inShards) {
    if (seen.has(f)) duplicates.push(f);
    seen.set(f, true);
  }

  const missing = onDisk.filter((f) => !seen.has(f));
  const phantom = inShards.filter((f) => !onDisk.includes(f));

  const errors = [];
  if (missing.length) errors.push(`Flows missing from shard manifest: ${missing.join(', ')}`);
  if (phantom.length) errors.push(`Manifest references phantom flow files: ${phantom.join(', ')}`);
  if (duplicates.length) errors.push(`Duplicated flows across shards: ${duplicates.join(', ')}`);

  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error('');
    console.error('Add the new flow file to a shard in museum-frontend/.maestro/shards.json,');
    console.error('OR remove the manifest entry if the flow was deleted.');
    process.exit(1);
  }

  console.log(`OK — ${onDisk.length} Maestro flows mapped to ${manifest.shards.length} shards.`);
  process.exit(0);
}

main();
