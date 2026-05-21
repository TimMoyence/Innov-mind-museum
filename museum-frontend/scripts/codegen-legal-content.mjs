#!/usr/bin/env node
// @ts-check
/**
 * codegen-legal-content — regenerate
 *   museum-frontend/features/legal/privacyPolicyContent.ts
 * from
 *   museum-backend/src/shared/legal/privacy-content.canonical.json
 * (single source of truth — see ADR for canonical-content-source).
 *
 * Why this exists
 * ---------------
 * Before this script, `privacyPolicyContent.ts` was hand-maintained and went
 * out of drift with the canonical JSON: the file's docblock listed 19
 * subprocessors but the BODY only mentioned 6 (and 12 sections instead of 14).
 * The drift sentinel (privacy-content-drift.mjs) accepted the file because it
 * grepped the raw source — including comments — for the canonical tokens.
 *
 * Phase B v3 (UFR-022 fresh-context, RUN_ID 2026-05-21-p0-gdpr) hardens the
 * sentinel to STRIP COMMENTS before grepping. That makes alias-via-docblock
 * impossible. To keep the FE surface in sync we now generate the file from
 * the canonical JSON every release — the body literally lists each section
 * (14) and each subprocessor (19) as inline TS literals.
 *
 * Run it manually after touching the canonical JSON:
 *   node scripts/codegen-legal-content.mjs
 *
 * The script is idempotent and prettier-clean (single-quoted strings, 2-space
 * indent, trailing commas where prettier emits them). Re-run in CI to verify
 * drift via `git diff --exit-code -- features/legal/privacyPolicyContent.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(FE_ROOT, '..');
const CANONICAL_PATH = resolve(
  REPO_ROOT,
  'museum-backend/src/shared/legal/privacy-content.canonical.json',
);
const OUTPUT_PATH = resolve(FE_ROOT, 'features/legal/privacyPolicyContent.ts');

/**
 * @typedef {{ id: string; title: string; paragraphs: string[] }} CanonicalSection
 * @typedef {{
 *   name: string;
 *   role: string;
 *   jurisdiction: string;
 *   transferMechanism: 'SCC' | 'adequacy' | 'none' | 'internal';
 *   category: string;
 * }} CanonicalSubprocessor
 * @typedef {{
 *   sections: CanonicalSection[];
 *   recipients: CanonicalSubprocessor[];
 * }} CanonicalLocale
 * @typedef {{
 *   version: string;
 *   lastUpdated: string;
 *   locales: { en: CanonicalLocale; fr: CanonicalLocale };
 * }} CanonicalPrivacy
 */

/**
 * Escape a TS single-quoted string literal. Handles backslash, single quote,
 * and the common newline / carriage-return cases. The canonical JSON itself
 * never contains stray control chars so the simple form is sufficient.
 *
 * @param {string} value
 * @returns {string}
 */
function tsString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

/**
 * Emit a TS object literal for a single section.
 *
 * @param {CanonicalSection} section
 * @param {string} indent
 * @returns {string}
 */
function emitSection(section, indent) {
  const inner = indent + '  ';
  const paragraphs = section.paragraphs.map((p) => `${inner}    ${tsString(p)},`).join('\n');
  return [
    `${indent}{`,
    `${inner}id: ${tsString(section.id)},`,
    `${inner}title: ${tsString(section.title)},`,
    `${inner}paragraphs: [`,
    paragraphs,
    `${inner}],`,
    `${indent}},`,
  ].join('\n');
}

/**
 * Emit a TS object literal for one subprocessor.
 *
 * @param {CanonicalSubprocessor} sub
 * @param {string} indent
 * @returns {string}
 */
function emitSubprocessor(sub, indent) {
  const inner = indent + '  ';
  return [
    `${indent}{`,
    `${inner}name: ${tsString(sub.name)},`,
    `${inner}role: ${tsString(sub.role)},`,
    `${inner}jurisdiction: ${tsString(sub.jurisdiction)},`,
    `${inner}transferMechanism: ${tsString(sub.transferMechanism)},`,
    `${inner}category: ${tsString(sub.category)},`,
    `${indent}},`,
  ].join('\n');
}

/**
 * Render the full `privacyPolicyContent.ts` source from the canonical JSON.
 *
 * The English locale is used for the RN screen (its UI labels are English
 * throughout); the section ids are locale-invariant. The vendor list is
 * emitted both as the EN recipients section body (for narrative) AND as an
 * exported `PRIVACY_SUBPROCESSORS` array (machine-readable + grep-stable).
 *
 * @param {CanonicalPrivacy} canonical
 * @returns {string}
 */
function renderSource(canonical) {
  const en = canonical.locales.en;
  const sectionsBlock = en.sections.map((s) => emitSection(s, '    ')).join('\n');
  const subprocessorsBlock = en.recipients.map((r) => emitSubprocessor(r, '  ')).join('\n');

  return `/**
 * GENERATED-FROM-CANONICAL — DO NOT EDIT MANUALLY.
 *
 * Regenerate with:
 *   node museum-frontend/scripts/codegen-legal-content.mjs
 *
 * Source of truth:
 *   museum-backend/src/shared/legal/privacy-content.canonical.json
 *
 * Drift sentinel (post-comment-strip, R15):
 *   museum-backend/scripts/sentinels/privacy-content-drift.mjs
 *
 * The sentinel strips JSDoc / line / HTML comments before grepping, so the
 * canonical tokens (version, lastUpdated, section ids, subprocessor names)
 * must appear as INLINE TS literals in the body below — not just in this
 * header.
 */

/** A single numbered section within the privacy policy document. */
export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

/** A single subprocessor row (R11 — 19 vendors, EU AI Act + GDPR Art. 28). */
export interface PrivacySubprocessor {
  name: string;
  role: string;
  jurisdiction: string;
  transferMechanism: 'SCC' | 'adequacy' | 'none' | 'internal';
  category: string;
}

/** Structured content of the full GDPR-compliant privacy policy, rendered in the legal screen. */
export interface PrivacyPolicyContent {
  title: string;
  version: string;
  lastUpdated: string;
  controllerName: string;
  controllerAddress: string;
  contactEmail: string;
  dpoContact: string;
  rightsSummary: string[];
  quickFacts: { label: string; value: string }[];
  releaseChecklist: string[];
  sections: PrivacyPolicySection[];
  subprocessors: PrivacySubprocessor[];
}

/**
 * Subprocessors disclosed on every public surface (R11). Emitted as a
 * top-level export so the drift sentinel and the in-app subprocessors view
 * both grep / consume the same list.
 */
export const PRIVACY_SUBPROCESSORS: readonly PrivacySubprocessor[] = [
${subprocessorsBlock}
] as const;

/** Complete privacy policy content for the Musaium app, structured for in-app rendering. */
export const PRIVACY_POLICY_CONTENT: PrivacyPolicyContent = {
  title: 'Privacy Policy (GDPR / RGPD)',
  version: ${tsString(canonical.version)},
  lastUpdated: ${tsString(canonical.lastUpdated)},
  controllerName: 'InnovMind (Tim Moyence, Entrepreneur Individuel)',
  controllerAddress: 'France',
  contactEmail: 'tim.moyence@gmail.com',
  dpoContact: "Non désigné (non requis au titre de l'article 37 du RGPD)",
  rightsSummary: [
    'Access your data',
    'Correct inaccurate data',
    'Request deletion where applicable',
    'Restrict processing in specific cases',
    'Portability for eligible data',
    'Object to processing based on legitimate interests',
    'Withdraw consent for permission-based processing',
  ],
  quickFacts: [
    { label: 'Scope', value: 'Musaium mobile app + related support channels' },
    { label: 'Data types', value: 'Account, chat, image upload, voice upload, diagnostics' },
    { label: 'Permissions', value: 'Camera / microphone only on explicit user action' },
    { label: 'User rights', value: 'GDPR rights available via privacy contact / support' },
  ],
  releaseChecklist: [],
  sections: [
${sectionsBlock}
  ],
  subprocessors: [...PRIVACY_SUBPROCESSORS],
};

/**
 * Checks whether a string contains a placeholder marker that must be replaced before release.
 * @param value - String to inspect.
 * @returns \`true\` if the value contains \`'TO_FILL_'\`.
 */
export const isPrivacyPlaceholderValue = (value: string): boolean => {
  return value.includes('TO_FILL_');
};
`;
}

function main() {
  /** @type {CanonicalPrivacy} */
  const canonical = JSON.parse(readFileSync(CANONICAL_PATH, 'utf8'));
  const source = renderSource(canonical);
  writeFileSync(OUTPUT_PATH, source, 'utf8');
  process.stdout.write(`[codegen-legal-content] wrote ${OUTPUT_PATH}\n`);
}

main();
