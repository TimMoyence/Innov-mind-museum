#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * nightly-status — surface the last FULL nightly runs so an unattended red
 * isn't silently ignored:
 *   - mobile: the full Maestro suite (nightly cron OR push-to-main)
 *   - web:    the nightly multi-browser Playwright (web e2e) cron run
 *
 * Per-PR CI only runs the fast subsets (mobile `smoke` ~12min, web Chromium-only);
 * the full mobile 4-shard suite runs nightly + on push to main, and the full
 * multi-browser web suite runs nightly. Run this at the start of any
 * frontend-touching session (each workflow also auto-files a GitHub issue on a
 * red full run via its alert job — `nightly-maestro-alert` / `nightly-web-e2e-alert`
 * — but this gives an at-a-glance check without leaving the terminal).
 *
 * Usage:
 *   node scripts/nightly-status.mjs            # both mobile + web
 *   node scripts/nightly-status.mjs --mobile   # mobile (Maestro) only
 *   node scripts/nightly-status.mjs --web      # web (Playwright) only
 *
 * Exit 0 = green / unknown (non-fatal); exit 1 = at least one full run is RED.
 */
import { execFileSync } from 'node:child_process';

/**
 * Query the last full nightly run for a given workflow.
 * @param {object} cfg
 * @param {string} cfg.label    human label for the surface (e.g. "Maestro")
 * @param {string} cfg.workflow `gh run list --workflow` value (file name or `name:`)
 * @param {(r: object) => boolean} cfg.isFull predicate selecting the "full" run
 * @returns {{ red: boolean }} red=true if the last full run completed non-success.
 *          Always non-fatal: gh missing / unauthed / offline => { red: false }.
 */
function reportWorkflow({ label, workflow, isFull }) {
  let raw;
  try {
    raw = execFileSync(
      'gh',
      [
        'run',
        'list',
        '--workflow',
        workflow,
        '-L',
        '20',
        '--json',
        'event,headBranch,conclusion,status,createdAt,url',
      ],
      { encoding: 'utf8' },
    );
  } catch (e) {
    // Non-fatal: gh missing / unauthed / offline must not block a session.
    console.log(`nightly-status [${label}]: could not query gh (${String(e.message).split('\n')[0]}).`);
    return { red: false };
  }

  let runs;
  try {
    runs = JSON.parse(raw);
  } catch (e) {
    console.log(`nightly-status [${label}]: could not parse gh output (${String(e.message).split('\n')[0]}).`);
    return { red: false };
  }

  const full = runs.find(isFull);
  if (!full) {
    console.log(`nightly-status [${label}]: no full run in the last 20 runs yet.`);
    return { red: false };
  }

  const done = full.status === 'completed';
  const concl = full.conclusion || full.status;
  const icon = concl === 'success' ? '✅' : done ? '❌' : '⏳';
  console.log(`${icon} Last full ${label} (${full.event}, ${full.createdAt.slice(0, 10)}): ${concl}`);
  console.log(`   ${full.url}`);

  if (done && concl !== 'success') {
    console.log(`   ⚠️  Full ${label} is RED — config/flows may be broken. Investigate before shipping frontend.`);
    return { red: true };
  }
  return { red: false };
}

const args = process.argv.slice(2);
const wantMobile = args.length === 0 || args.includes('--mobile') || args.includes('--all');
const wantWeb = args.length === 0 || args.includes('--web') || args.includes('--all');

let anyRed = false;

if (wantMobile) {
  // Mobile "full" = nightly cron OR push to main.
  const { red } = reportWorkflow({
    label: 'Maestro',
    workflow: 'mobile',
    isFull: (r) => r.event === 'schedule' || (r.event === 'push' && r.headBranch === 'main'),
  });
  anyRed = anyRed || red;
}

if (wantWeb) {
  // Web "full" = the nightly multi-browser Playwright cron run (event === schedule).
  const { red } = reportWorkflow({
    label: 'Web Playwright',
    workflow: 'web',
    isFull: (r) => r.event === 'schedule',
  });
  anyRed = anyRed || red;
}

process.exit(anyRed ? 1 : 0);
