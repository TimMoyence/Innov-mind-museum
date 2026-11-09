import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as ts from 'typescript';

export const REPO_ROOT = resolve(__dirname, '../../../..');

const EXEMPT =
  /(^|\/)node_modules\/|\/generated\/|\.generated\.|\/migrations\/|\.d\.ts$|\/ios\/Pods\/|(^|\/)dist\/|(^|\/)\.next\//;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const HASHED = /\.(ya?ml|sh)$|(^|\/)Dockerfile[^/]*$|\.dockerignore$/;
const DISABLE =
  /eslint-(disable|enable)|@ts-(expect-error|ignore|nocheck)|prettier-ignore|Stryker (disable|restore)|istanbul ignore|c8 ignore|shellcheck disable/;

export interface FoundComment {
  path: string;
  line: number;
  text: string;
}

export const trackedSources = (): string[] =>
  execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\n')
    .filter((path) => path !== '' && !EXEMPT.test(path) && (CODE.test(path) || HASHED.test(path)));

const lineOf = (text: string, pos: number): number => text.slice(0, pos).split('\n').length;

export const codeComments = (path: string, text: string): FoundComment[] => {
  const kind = path.endsWith('x')
    ? ts.ScriptKind.TSX
    : path.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Map<number, FoundComment>();
  const collect = (pos: number): void => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, pos) ?? []),
    ]) {
      const body = text.slice(range.pos, range.end);
      if (!body.startsWith('#!')) {
        found.set(range.pos, { path, line: lineOf(text, range.pos), text: body });
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    collect(node.getFullStart());
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...found.values()];
};

const trailingHash = (line: string): number => {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return i;
    }
  }
  return -1;
};

const HEREDOC = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/;
const BLOCK_START = /^(\s*)(?:-\s+)?(?:([A-Za-z0-9_.-]+)\s*:\s*)?[|>][+-]?\d*\s*(?:#.*)?$/;
const DIRECTIVE = /^#\s*(syntax|escape|check)=/;
const RENOVATE_PIN = /uses:\s*\S+@[0-9a-f]{40}\s*$/;
const RENOVATE_VERSION = /^#\s*v?\d[\w.-]*\s*$/;

export const hashComments = (path: string, text: string): FoundComment[] => {
  const yaml = /\.ya?ml$/.test(path);
  const docker = /(^|\/)Dockerfile[^/]*$/.test(path);
  const lines = text.split('\n');
  const found: FoundComment[] = [];
  let block: { indent: number; shell: boolean } | null = null;
  let heredoc: string | null = null;
  let headerDone = false;
  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    const indent = raw.length - raw.trimStart().length;
    if (index === 0 && raw.startsWith('#!')) return;
    if (docker && !headerDone) {
      if (DIRECTIVE.test(trimmed)) return;
      if (trimmed !== '') headerDone = true;
    }
    if (yaml && block && trimmed !== '' && indent <= block.indent) block = null;
    const shellContext = !yaml || block?.shell === true;
    if (yaml && block && !block.shell) return;
    if (heredoc) {
      if (trimmed === heredoc) heredoc = null;
      return;
    }
    if (shellContext) {
      const marker = HEREDOC.exec(raw);
      if (marker && !trimmed.startsWith('#')) heredoc = marker[1] ?? null;
    }
    if (trimmed.startsWith('#')) {
      found.push({ path, line: index + 1, text: trimmed });
      return;
    }
    if (yaml && !block) {
      const at = trailingHash(raw);
      const renovatePin =
        at > 0 && RENOVATE_PIN.test(raw.slice(0, at)) && RENOVATE_VERSION.test(raw.slice(at));
      if (at > 0 && !renovatePin) found.push({ path, line: index + 1, text: raw.slice(at) });
      const start = BLOCK_START.exec(raw.slice(0, at > 0 ? at : raw.length).trimEnd());
      if (start) block = { indent, shell: start[2] === 'run' || start[2] === 'script' };
    }
  });
  return found;
};

export const commentsOf = (path: string): FoundComment[] => {
  const text = readFileSync(resolve(REPO_ROOT, path), 'utf8');
  return CODE.test(path) ? codeComments(path, text) : hashComments(path, text);
};

export const isDisable = (comment: FoundComment): boolean => DISABLE.test(comment.text);
