#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'shared', 'locales');
const REFERENCE_LANG = 'en';
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flattenEntries(obj, prefix = '') {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenEntries(value, fullKey));
    } else {
      entries.push([fullKey, value]);
    }
  }
  return entries;
}

function valuesByBaseKey(obj) {
  const byBase = new Map();
  for (const [key, value] of flattenEntries(obj)) {
    const base = key.replace(PLURAL_SUFFIX, '');
    const form = key.slice(base.length);
    const entry = byBase.get(base) ?? { values: [], forms: new Set() };
    entry.values.push(value);
    entry.forms.add(form);
    byBase.set(base, entry);
  }
  return byBase;
}

function missingForm(base, entry) {
  if (!entry) return base;
  if (entry.forms.has('') || entry.forms.has('_other')) return null;
  return `${base}_other`;
}

function run() {
  const refPath = path.join(LOCALES_DIR, REFERENCE_LANG, 'translation.json');
  if (!fs.existsSync(refPath)) {
    console.error(`Reference file not found: ${refPath}`);
    process.exit(1);
  }

  const reference = valuesByBaseKey(JSON.parse(fs.readFileSync(refPath, 'utf8')));

  console.log(`Reference (${REFERENCE_LANG}): ${reference.size} keys\n`);

  const langDirs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== REFERENCE_LANG)
    .map((d) => d.name);

  let hasErrors = false;

  for (const lang of langDirs) {
    const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING: ${lang}/translation.json`);
      hasErrors = true;
      continue;
    }

    const translation = valuesByBaseKey(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    const missing = [...reference.keys()]
      .map((base) => missingForm(base, translation.get(base)))
      .filter((key) => key !== null);
    const empty = [...translation]
      .filter(
        ([base, { values }]) =>
          reference.has(base) && values.some((v) => typeof v !== 'string' || v.trim() === ''),
      )
      .map(([base]) => base);
    const extra = [...translation.keys()].filter((base) => !reference.has(base));

    if (missing.length === 0 && empty.length === 0) {
      console.log(`✓ ${lang}: ${translation.size} keys OK`);
    } else {
      hasErrors = true;
      if (missing.length > 0) {
        console.error(`✗ ${lang}: ${missing.length} MISSING keys:`);
        missing.forEach((k) => console.error(`    - ${k}`));
      }
      if (empty.length > 0) {
        console.error(`✗ ${lang}: ${empty.length} EMPTY values:`);
        empty.forEach((k) => console.error(`    - ${k}`));
      }
    }

    if (extra.length > 0) {
      console.warn(`  ⚠ ${lang}: ${extra.length} extra keys (not in reference)`);
      extra.forEach((k) => console.warn(`    - ${k}`));
    }
  }

  console.log('');

  if (hasErrors) {
    console.error('i18n completeness check FAILED');
    process.exit(1);
  }

  console.log('i18n completeness check PASSED');
}

run();
