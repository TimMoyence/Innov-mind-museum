#!/usr/bin/env node

/**
 * Validates that all translation files have the same keys as the English reference
 * and that no values are empty strings.
 *
 * Usage: node scripts/check-i18n-completeness.js
 * Exit code 0 = all OK, 1 = missing/empty keys found.
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'shared', 'locales');
const REFERENCE_LANG = 'en';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function run() {
  const refPath = path.join(LOCALES_DIR, REFERENCE_LANG, 'translation.json');
  if (!fs.existsSync(refPath)) {
    console.error(`Reference file not found: ${refPath}`);
    process.exit(1);
  }

  const reference = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const refKeys = flattenKeys(reference);

  console.log(`Reference (${REFERENCE_LANG}): ${refKeys.length} keys\n`);

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

    const translation = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const missing = [];
    const empty = [];

    for (const key of refKeys) {
      const value = getNestedValue(translation, key);
      if (value === undefined || value === null) {
        missing.push(key);
      } else if (typeof value !== 'string') {
        empty.push(key);
      } else if (value.trim() === '') {
        empty.push(key);
      }
    }

    const extra = flattenKeys(translation).filter((k) => !refKeys.includes(k));

    if (missing.length === 0 && empty.length === 0) {
      console.log(`✓ ${lang}: ${flattenKeys(translation).length} keys OK`);
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
