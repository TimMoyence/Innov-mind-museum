#!/usr/bin/env node
// Validates relative markdown links in docs/DOCS_INDEX.md resolve to existing files.
// Usage: node scripts/check-docs-links.cjs
// Exit 0 if all links resolve; exit 1 with listing otherwise.

const fs = require('node:fs');
const path = require('node:path');

const INDEX = path.join(__dirname, '..', 'docs', 'DOCS_INDEX.md');
const content = fs.readFileSync(INDEX, 'utf8');
const LINK = /\]\(([^)#]+?)(?:#[^)]*)?\)/g;

const broken = [];
let m;
while ((m = LINK.exec(content)) !== null) {
  const href = m[1].trim();
  if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) continue;
  const resolved = path.resolve(path.dirname(INDEX), href);
  if (!fs.existsSync(resolved)) broken.push({ href, resolved });
}

if (broken.length === 0) {
  console.log(`docs/DOCS_INDEX.md: all links resolve.`);
  process.exit(0);
}
console.error(`docs/DOCS_INDEX.md: ${broken.length} broken link(s):`);
for (const b of broken) console.error(`  - ${b.href} (expected at ${b.resolved})`);
process.exit(1);
