#!/usr/bin/env node
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

function tsString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

function emitSection(section, indent) {
  const inner = indent + '  ';
  const paragraphLine = inner + '  ';
  const paragraphs = section.paragraphs.map((p) => `${paragraphLine}${tsString(p)},`).join('\n');
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

function renderSource(canonical) {
  const en = canonical.locales.en;
  const sectionsBlock = en.sections.map((s) => emitSection(s, '    ')).join('\n');
  const subprocessorsBlock = en.recipients.map((r) => emitSubprocessor(r, '  ')).join('\n');

  return `export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface PrivacySubprocessor {
  name: string;
  role: string;
  jurisdiction: string;
  transferMechanism: 'SCC' | 'adequacy' | 'none' | 'internal';
  category: string;
}

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

export const PRIVACY_SUBPROCESSORS: readonly PrivacySubprocessor[] = [
${subprocessorsBlock}
] as const;

export const PRIVACY_POLICY_CONTENT: PrivacyPolicyContent = {
  title: 'Privacy Policy (GDPR / RGPD)',
  version: ${tsString(canonical.version)},
  lastUpdated: ${tsString(canonical.lastUpdated)},
  controllerName: 'InnovMind (Tim Moyence, Entrepreneur Individuel)',
  controllerAddress: 'France',
  contactEmail: 'contact@musaium.com',
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

export const isPrivacyPlaceholderValue = (value: string): boolean => {
  return value.includes('TO_FILL_');
};
`;
}

const LEGAL_SOURCE_DIR = resolve(REPO_ROOT, 'museum-backend/src/shared/legal');
const WEB_LEGAL_DIR = resolve(REPO_ROOT, 'museum-web/src/lib/legal');
const WEB_COPIES = ['privacy-content.canonical.json', 'terms-content.canonical.json'];

function main() {
  const check = process.argv.includes('--check');
  const canonical = JSON.parse(readFileSync(CANONICAL_PATH, 'utf8'));
  const outputs = [
    [OUTPUT_PATH, renderSource(canonical)],
    ...WEB_COPIES.map((name) => [
      resolve(WEB_LEGAL_DIR, name),
      readFileSync(resolve(LEGAL_SOURCE_DIR, name), 'utf8'),
    ]),
  ];
  const drifted = outputs.filter(([path, content]) => readFileSync(path, 'utf8') !== content);
  if (check) {
    for (const [path] of drifted) process.stderr.write(`[codegen-legal-content] drift: ${path}\n`);
    process.exit(drifted.length === 0 ? 0 : 1);
  }
  for (const [path, content] of drifted) {
    writeFileSync(path, content, 'utf8');
    process.stdout.write(`[codegen-legal-content] wrote ${path}\n`);
  }
}

main();
