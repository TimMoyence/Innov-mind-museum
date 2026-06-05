#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * nightly-status — surface the last FULL Maestro run (nightly cron OR push-to-main)
 * so an unattended red full run isn't silently ignored.
 *
 * Per-PR CI only runs the fast `smoke` subset (~12min); the full 4-shard suite
 * runs nightly + on push to main. Run this at the start of any frontend-touching
 * session (the `mobile` workflow alert job also auto-files a GitHub issue on a
 * red full run, but this gives an at-a-glance check without leaving the terminal).
 *
 * Usage: node scripts/nightly-status.mjs
 * Exit 0 = green / unknown (non-fatal); exit 1 = the last full run is RED.
 */
import { execFileSync } from 'node:child_process';

try {
  const raw = execFileSync(
    'gh',
    [
      'run',
      'list',
      '--workflow',
      'mobile',
      '-L',
      '20',
      '--json',
      'event,headBranch,conclusion,status,createdAt,url',
    ],
    { encoding: 'utf8' },
  );
  const runs = JSON.parse(raw);
  const full = runs.find(
    (r) => r.event === 'schedule' || (r.event === 'push' && r.headBranch === 'main'),
  );

  if (!full) {
    console.log('nightly-status: no full Maestro run (nightly / push-main) in the last 20 runs yet.');
    process.exit(0);
  }

  const done = full.status === 'completed';
  const concl = full.conclusion || full.status;
  const icon = concl === 'success' ? '✅' : done ? '❌' : '⏳';
  console.log(`${icon} Last full Maestro (${full.event}, ${full.createdAt.slice(0, 10)}): ${concl}`);
  console.log(`   ${full.url}`);

  if (done && concl !== 'success') {
    console.log('   ⚠️  Full Maestro is RED — config/flows may be broken. Investigate before shipping frontend.');
    process.exit(1);
  }
  process.exit(0);
} catch (e) {
  // Non-fatal: gh missing / unauthed / offline must not block a session.
  console.log(`nightly-status: could not query gh (${String(e.message).split('\n')[0]}).`);
  process.exit(0);
}
