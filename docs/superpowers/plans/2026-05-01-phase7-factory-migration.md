# Phase 7 — Factory Migration + Rule Tightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 1 baselined backend file to a shared factory, extend the `no-inline-test-entities` rule with shape-match detection, audit + add missing factories, document factory pattern.

**Architecture:** Mostly mechanical — extract file-local factories to `tests/helpers/<area>/<entity>.fixtures.ts` so the cast lives in helper-exempt paths. Then extend the existing TypeScript-aware ESLint rule with a 4th trigger path (shape-match: ObjectExpression containing all signature props of a configured entity, even without cast or annotation). Configure via `detectShapeMatch: true` opt-in in BE + FE eslint configs. Audit walks both apps' test code to find entities used ≥3× without factories, adds them.

**Tech Stack:** `@typescript-eslint/utils` `RuleCreator`, `@typescript-eslint/rule-tester`, Jest, Node 22 + pnpm 10. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-01-phase7-factory-migration-design.md`

**Total commits:** 4 (A / B / C / D per spec §7).

---

## Pre-Flight (no commit)

- [ ] **Step 0.1: Capture baseline + verify state**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
cat tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json
cat tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts
ls museum-backend/tests/helpers/support/ 2>&1
ls museum-frontend/__tests__/helpers/factories/
cd museum-backend && pnpm test 2>&1 | tail -3
```

Expected: baseline = 1 entry, cap = 1, support helper dir absent (will be created), FE factories present, BE tests green.

- [ ] **Step 0.2: Anti-leak protocol**

NEVER touch:
- `museum-frontend/ios/...`
- `museum-frontend/__tests__/hooks/useSocialLogin.test.ts`
- `museum-frontend/__tests__/infrastructure/socialAuthProviders.test.ts`
- `museum-frontend/features/auth/...`
- `museum-frontend/__tests__/a11y/...`
- `museum-frontend/__tests__/components/AuthScreen.test.tsx`
- `AGENTS.md`, `docs/plans/README.md`, `museum-backend/src/helpers/swagger.ts`
- Any path in `git status --short` you didn't create

Apply before EVERY commit:
```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git restore --staged . && git add <intended only> && git diff --cached --name-only | sort
```

---

## Commit A — Migrate baselined file + cap → 0

### Task A1: Create the support ticket factory helper

**Files:**
- Create: `museum-backend/tests/helpers/support/ticket.fixtures.ts`

- [ ] **Step A1.1: Write the factory file**

```bash
mkdir -p /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/helpers/support
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/helpers/support/ticket.fixtures.ts <<'EOF'
import { SupportTicket } from '@modules/support/domain/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticketMessage.entity';

/**
 * Test factory for a SupportTicket entity. Override fields via the
 * `overrides` parameter; defaults reflect a typical "open / medium-priority
 * help" ticket.
 */
export function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-001',
    userId: 1,
    subject: 'Help needed',
    description: 'I have a problem',
    status: 'open',
    priority: 'medium',
    category: null,
    assignedTo: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as SupportTicket;
}

/**
 * Test factory for a TicketMessage entity. Override fields via the
 * `overrides` parameter; defaults reflect a visitor-authored message
 * on `ticket-001`.
 */
export function makeTicketMessage(overrides: Partial<TicketMessage> = {}): TicketMessage {
  return {
    id: 'msg-001',
    ticketId: 'ticket-001',
    senderId: 1,
    senderRole: 'visitor',
    text: 'Hello',
    createdAt: new Date('2025-06-01'),
    ...overrides,
  } as TicketMessage;
}
EOF
```

The casts `} as SupportTicket;` / `} as TicketMessage;` live in a helper-exempt path — the rule does not fire on them.

- [ ] **Step A1.2: Verify TS compiles**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 0 errors.

### Task A2: Update the test file to import the factories

**Files:**
- Modify: `museum-backend/tests/unit/support/support-repository.test.ts`

- [ ] **Step A2.1: Read the file head**

```bash
head -50 /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/unit/support/support-repository.test.ts
```

Locate the inline `function makeTicket(...)` and `function makeTicketMessage(...)` definitions (around lines 10-40 per the earlier inspection).

- [ ] **Step A2.2: Replace inline factories with import**

Use `Edit` to replace the inline `makeTicket` + `makeTicketMessage` function definitions with a single import line at the top of the file (in the existing import block):

Add:
```ts
import { makeTicket, makeTicketMessage } from 'tests/helpers/support/ticket.fixtures';
```

Delete the entire `function makeTicket(...) { ... }` block AND the `function makeTicketMessage(...) { ... }` block.

If the file has a "// ─── Factories ───" comment block above them, also delete that section header.

- [ ] **Step A2.3: Run the test to verify still green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm test -- --testPathPattern='support-repository' 2>&1 | tail -10
```

Expected: same pass count as before (no behavioural change; just import refactor).

### Task A3: Remove from baseline + tighten cap

**Files:**
- Modify: `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json`
- Modify: `tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts`

- [ ] **Step A3.1: Empty the baseline**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json <<'EOF'
{
  "baseline": []
}
EOF
```

- [ ] **Step A3.2: Tighten the cap**

In `tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts`, change:

```ts
const PHASE_0_CAP = 1;
```

to:

```ts
// Phase 7 (2026-05-01) — baseline emptied. Cap is now 0; any new inline
// `as Entity` outside helpers triggers an immediate gate fail.
const PHASE_0_CAP = 0;
```

- [ ] **Step A3.3: Run the cap test**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/tools/eslint-plugin-musaium-test-discipline && pnpm test 2>&1 | tail -10
```

Expected: cap test passes (baseline length 0 ≤ 0).

### Task A4: Run BE + FE lint to confirm no regressions

- [ ] **Step A4.1: Run lint**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm lint 2>&1 | tail -5
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend && npx eslint __tests__ 2>&1 | tail -5
```

Expected: both exit 0. If a NEW violation surfaced (e.g., a file that was previously baselined-by-mistake), investigate before continuing.

### Task A5: Anti-leak commit A

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/tests/helpers/support/ticket.fixtures.ts
git add museum-backend/tests/unit/support/support-repository.test.ts
git add tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json
git add tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts

git diff --cached --name-only | sort
```

Verify exactly 4 paths.

```bash
git commit -m "$(cat <<'EOF'
test(factory): migrate ticket factory helpers + tighten cap to 0 (Phase 7 Group A)

Phase 7 Group A — finishes the Phase 0 grandfather baseline migration.

- museum-backend/tests/helpers/support/ticket.fixtures.ts: extracts
  makeTicket() + makeTicketMessage() that previously lived inline in
  support-repository.test.ts. Casts live in the helper-exempt path.
- museum-backend/tests/unit/support/support-repository.test.ts: imports
  the factories instead of declaring them inline.
- tools/eslint-plugin-musaium-test-discipline/baselines/
  no-inline-test-entities.json: baseline emptied (was 1 entry).
- tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts:
  PHASE_0_CAP tightened from 1 → 0. Any new `as Entity` outside helpers
  now triggers an immediate gate fail.

No behavioural change in the test contract; just the import location.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

If pre-commit hook bundles unrelated files: STOP, do NOT amend, report DONE_WITH_CONCERNS.

---

## Commit B — Shape-match rule extension

### Task B1: Add `detectShapeMatch` option + RuleTester self-tests (TDD)

**Files:**
- Modify: `tools/eslint-plugin-musaium-test-discipline/src/rules/no-inline-test-entities.ts`
- Modify: `tools/eslint-plugin-musaium-test-discipline/tests/rules/no-inline-test-entities.test.ts`

- [ ] **Step B1.1: Add failing tests for shape-match (RED)**

In `tools/eslint-plugin-musaium-test-discipline/tests/rules/no-inline-test-entities.test.ts`, find the existing `valid:` and `invalid:` arrays. Add to the existing `valid` array:

```ts
// Shape-match enabled but inside a helper file → exempt
{
  code: "const u = { id: 1, email: 'x', passwordHash: 'h' };",
  options: [{ detectShapeMatch: true }],
  filename: '/repo/tests/helpers/auth/user.fixtures.ts',
},
// Shape-match enabled but the call site is `makeUser({...})` — factory exempt
{
  code: "const u = makeUser({ id: 1, email: 'x', passwordHash: 'h' });",
  options: [{ detectShapeMatch: true }],
  filename: '/repo/tests/unit/auth/foo.test.ts',
},
// Default detectShapeMatch=false; shape-match alone should NOT fire
{
  code: "const u = { id: 1, email: 'x', passwordHash: 'h' };",
  filename: '/repo/tests/unit/auth/foo.test.ts',
},
// Shape-match enabled but only 2 of 3 signature props present
{
  code: "const u = { id: 1, email: 'x' };",
  options: [{ detectShapeMatch: true }],
  filename: '/repo/tests/unit/auth/foo.test.ts',
},
```

Add to the existing `invalid` array:

```ts
// Shape-match: User signature {id, email, passwordHash} all present, no cast/annotation
{
  code: "const u = { id: 1, email: 'x', passwordHash: 'h' };",
  options: [{ detectShapeMatch: true }],
  filename: '/repo/tests/unit/auth/foo.test.ts',
  errors: [{ messageId: 'inlineEntity' }],
},
// Shape-match: ChatMessage signature {id, sessionId, role, text}
{
  code: "const m = { id: 'm1', sessionId: 's1', role: 'user', text: 'hi', extra: 'x' };",
  options: [{ detectShapeMatch: true }],
  filename: '/repo/tests/unit/chat/foo.test.ts',
  errors: [{ messageId: 'inlineEntity' }],
},
// Shape-match: SupportTicket signature {id, userId, subject, description, status}
{
  code: "const t = { id: 't1', userId: 1, subject: 's', description: 'd', status: 'open' };",
  options: [{ detectShapeMatch: true }],
  filename: '/repo/tests/unit/support/foo.test.ts',
  errors: [{ messageId: 'inlineEntity' }],
},
// Shape-match with custom signature override
{
  code: "const x = { foo: 1, bar: 2 };",
  options: [{ detectShapeMatch: true, shapeSignatures: { Custom: ['foo', 'bar'] } }],
  filename: '/repo/tests/unit/foo.test.ts',
  errors: [{ messageId: 'inlineEntity' }],
},
```

Save.

- [ ] **Step B1.2: Run plugin tests, expect FAIL**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/tools/eslint-plugin-musaium-test-discipline && pnpm test 2>&1 | tail -15
```

Expected: 4 new invalid cases fail (shape-match not implemented yet). 4 new valid cases may pass already (default `detectShapeMatch=false`).

- [ ] **Step B1.3: Implement shape-match in the rule (GREEN)**

In `tools/eslint-plugin-musaium-test-discipline/src/rules/no-inline-test-entities.ts`:

1. Extend the `Options` type:

```ts
type Options = [
  {
    entities?: string[];
    factoryHints?: Record<string, string>;
    helperPaths?: string[];
    /** Phase 7: enable shape-match detection (default false). */
    detectShapeMatch?: boolean;
    /** Phase 7: per-entity signature for shape-match. */
    shapeSignatures?: Record<string, string[]>;
  },
];
```

2. Add default signatures near the existing `DEFAULT_ENTITIES`:

```ts
const DEFAULT_SHAPE_SIGNATURES: Record<string, string[]> = {
  User: ['id', 'email', 'passwordHash'],
  ChatMessage: ['id', 'sessionId', 'role', 'text'],
  ChatSession: ['id', 'userId', 'locale', 'museumMode'],
  Review: ['id', 'rating', 'comment'],
  SupportTicket: ['id', 'userId', 'subject', 'description', 'status'],
  MuseumEntity: ['id', 'name', 'city', 'country'],
  AuditEvent: ['id', 'actorId', 'action', 'targetId'],
};
```

3. Update the schema (in `meta.schema`) to declare the 2 new options:

```ts
schema: [
  {
    type: 'object',
    properties: {
      entities: { type: 'array', items: { type: 'string' } },
      factoryHints: { type: 'object', additionalProperties: { type: 'string' } },
      helperPaths: { type: 'array', items: { type: 'string' } },
      detectShapeMatch: { type: 'boolean' },
      shapeSignatures: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
    },
    additionalProperties: false,
  },
],
```

4. In `create(context, [opts])`, add:

```ts
const detectShapeMatch = opts?.detectShapeMatch ?? false;
const shapeSignatures = { ...DEFAULT_SHAPE_SIGNATURES, ...(opts?.shapeSignatures ?? {}) };
```

5. Add a helper to detect when an `ObjectExpression`'s property names are a superset of any signature:

```ts
function objectExpressionPropNames(node: TSESTree.ObjectExpression): Set<string> {
  const names = new Set<string>();
  for (const prop of node.properties) {
    if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      names.add(prop.key.name);
    } else if (prop.type === 'Property' && prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
      names.add(prop.key.value);
    }
  }
  return names;
}

function matchingShapeEntity(
  node: TSESTree.ObjectExpression,
  signatures: Record<string, string[]>,
): string | null {
  const names = objectExpressionPropNames(node);
  for (const [entity, signature] of Object.entries(signatures)) {
    if (signature.every((p) => names.has(p))) {
      return entity;
    }
  }
  return null;
}
```

6. Add a new visitor for `ObjectExpression` (only when `detectShapeMatch` is true). Crucial: skip if the object is part of an existing TSAsExpression / TSTypeAssertion / type-annotated VariableDeclarator (already covered by other paths) AND skip if it's an argument of a known factory call:

```ts
function isFactoryCallArgument(node: TSESTree.ObjectExpression): boolean {
  const parent = (node as TSESTree.Node & { parent?: TSESTree.Node }).parent;
  if (parent?.type !== 'CallExpression') return false;
  const callee = parent.callee;
  if (callee.type === 'Identifier') {
    return /^(make|build|create)[A-Z]/.test(callee.name);
  }
  return false;
}

function isAlreadyCoveredByOtherPath(node: TSESTree.ObjectExpression): boolean {
  const parent = (node as TSESTree.Node & { parent?: TSESTree.Node }).parent;
  if (!parent) return false;
  if (parent.type === 'TSAsExpression' || parent.type === 'TSTypeAssertion') return true;
  if (parent.type === 'VariableDeclarator') {
    const decl = parent as TSESTree.VariableDeclarator;
    if (decl.id.type === 'Identifier' && decl.id.typeAnnotation) return true;
  }
  return false;
}
```

Then in the returned visitor object, ONLY when `detectShapeMatch`:

```ts
return {
  // ... existing TSAsExpression / TSTypeAssertion / VariableDeclarator visitors ...
  ObjectExpression(node) {
    if (!detectShapeMatch) return;
    if (isFactoryCallArgument(node)) return;
    if (isAlreadyCoveredByOtherPath(node)) return;
    const entity = matchingShapeEntity(node, shapeSignatures);
    if (entity) {
      reportInlineEntity(node, entity);
    }
  },
};
```

(If the existing visitor object only declares the 3 paths, merge the new ObjectExpression visitor into the same returned object literal.)

- [ ] **Step B1.4: Re-run plugin tests, expect GREEN**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/tools/eslint-plugin-musaium-test-discipline && pnpm test 2>&1 | tail -15
```

Expected: all valid + invalid (including the 4 new shape-match cases) pass.

- [ ] **Step B1.5: Build the plugin**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/tools/eslint-plugin-musaium-test-discipline && pnpm build 2>&1 | tail -3
```

Expected: dist regenerates.

### Task B2: Enable `detectShapeMatch` in BE + FE eslint configs

**Files:**
- Modify: `museum-backend/eslint.config.mjs`
- Modify: `museum-frontend/eslint.config.mjs`

- [ ] **Step B2.1: Find current rule config in BE**

```bash
grep -A6 "musaium-test-discipline/no-inline-test-entities" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/eslint.config.mjs | head -12
```

The current rule line is likely:

```js
'musaium-test-discipline/no-inline-test-entities': 'error',
```

- [ ] **Step B2.2: Replace with options form**

Use `Edit` to change to:

```js
'musaium-test-discipline/no-inline-test-entities': ['error', { detectShapeMatch: true }],
```

Make the same change in `museum-frontend/eslint.config.mjs`.

- [ ] **Step B2.3: Run BE + FE lint**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm lint 2>&1 | tail -10
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend && npx eslint __tests__ 2>&1 | tail -10
```

Expected: both exit 0.

If shape-match flags new violations:
- For each one: either migrate to a factory (preferred) or add an `eslint-disable-next-line` with mandatory `Justification:` + `Approved-by:` paragraphs (per Phase 0 §7.6 hard-rule policy).
- If the count is high (≥10), STOP and report DONE_WITH_CONCERNS — that's a Phase 7 audit finding, not a blocker; we can re-add those files to a temp baseline or land Commit B with `detectShapeMatch: false` first and tackle migration in Commit C.

### Task B3: Anti-leak commit B

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add tools/eslint-plugin-musaium-test-discipline/src/rules/no-inline-test-entities.ts
git add tools/eslint-plugin-musaium-test-discipline/tests/rules/no-inline-test-entities.test.ts
git add tools/eslint-plugin-musaium-test-discipline/dist/ 2>/dev/null || true  # if dist is tracked; per Phase 4 it's gitignored
git add museum-backend/eslint.config.mjs
git add museum-frontend/eslint.config.mjs

git diff --cached --name-only | sort
```

If dist/ is gitignored (per Phase 4 with `prepare: tsc`), skip it. Verify scope.

```bash
git commit -m "$(cat <<'EOF'
test(eslint): shape-match detection in no-inline-test-entities (Phase 7 Group B)

Phase 7 Group B — adds a 4th detection path to the rule.

- detectShapeMatch option (default false): when enabled, the rule
  fires on ObjectExpression literals containing all signature props
  of any configured entity, even without an `as Entity` cast or
  `: Entity` annotation. Catches loose patterns like
  `const u = { id: 1, email: 'x', passwordHash: 'h' };` that the
  Phase 0 strict rule missed.
- shapeSignatures option: per-entity signature override. Defaults:
  - User = [id, email, passwordHash]
  - ChatMessage = [id, sessionId, role, text]
  - ChatSession = [id, userId, locale, museumMode]
  - Review = [id, rating, comment]
  - SupportTicket = [id, userId, subject, description, status]
  - MuseumEntity = [id, name, city, country]
  - AuditEvent = [id, actorId, action, targetId]
- Exemptions: helper paths (already supported), factory call
  arguments (`makeUser({...})`), and objects already covered by the
  3 existing paths (cast / type-assertion / annotated declarator).
- 4 new RuleTester valid + 4 new invalid cases.
- BE + FE eslint configs enable detectShapeMatch: true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit C — Factory audit + add missing factories

### Task C1: Audit script — list entities + factory coverage

**Files:**
- Create: `scripts/sentinels/audit-factory-coverage.mjs` (one-off audit, exits 0)

- [ ] **Step C1.1: Write the audit script**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/audit-factory-coverage.mjs <<'EOF'
#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 7 audit: scan BE + FE entity files vs factory helpers.
 *
 * Reports which entities are referenced in tests but lack a `make<Entity>`
 * factory in `tests/helpers/<area>/` (BE) or `__tests__/helpers/factories/`
 * (FE). Writes the audit to /tmp/phase7-audit.txt.
 *
 * Heuristic: walk *.entity.ts files, derive the entity class name, count
 * test-file references, check for matching factory file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');

function walkFiles(dir, predicate) {
  const out = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) out.push(...walkFiles(full, predicate));
      else if (predicate(full)) out.push(full);
    }
  } catch { /* swallow ENOENT */ }
  return out;
}

function entitiesUnder(srcRoot) {
  return walkFiles(srcRoot, (f) => f.endsWith('.entity.ts')).map((f) => {
    const text = readFileSync(f, 'utf-8');
    const match = text.match(/export class (\w+)/);
    return { path: f, name: match ? match[1] : basename(f, '.entity.ts') };
  });
}

function countReferences(testFiles, name) {
  const re = new RegExp(`\\b${name}\\b`);
  let count = 0;
  for (const f of testFiles) {
    const text = readFileSync(f, 'utf-8');
    if (re.test(text)) count += 1;
  }
  return count;
}

function hasFactory(helperRoots, name) {
  const lower = name[0].toLowerCase() + name.slice(1);
  const factoryFnRe = new RegExp(`\\bmake${name}\\b`);
  for (const root of helperRoots) {
    const helpers = walkFiles(root, (f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of helpers) {
      if (basename(f).toLowerCase().includes(lower)) return f;
      const text = readFileSync(f, 'utf-8');
      if (factoryFnRe.test(text)) return f;
    }
  }
  return null;
}

function main() {
  const beEntities = entitiesUnder(join(ROOT, 'museum-backend', 'src'));
  const beTestFiles = walkFiles(join(ROOT, 'museum-backend', 'tests'), (f) => f.endsWith('.test.ts'));
  const beHelperRoots = [join(ROOT, 'museum-backend', 'tests', 'helpers')];

  const feHelperRoots = [join(ROOT, 'museum-frontend', '__tests__', 'helpers')];
  const feTestFiles = walkFiles(join(ROOT, 'museum-frontend', '__tests__'), (f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));

  const lines = ['# Phase 7 factory-coverage audit', ''];
  lines.push('## Backend');
  for (const e of beEntities) {
    const refs = countReferences(beTestFiles, e.name);
    const factory = hasFactory(beHelperRoots, e.name);
    if (refs >= 3 && !factory) {
      lines.push(`- MISSING: ${e.name} (refs: ${refs}, entity: ${e.path.replace(ROOT + '/', '')})`);
    }
  }
  lines.push('');
  lines.push('## Frontend');
  // FE entities are usually OpenAPI-generated types, not class entities.
  // Skip class-based audit for FE; rely on shape-match rule instead.
  lines.push('(skipped — FE uses OpenAPI types; shape-match rule covers gaps)');

  const out = lines.join('\n');
  console.log(out);
  // Write audit to /tmp for commit-body inclusion.
  try {
    require('node:fs').writeFileSync('/tmp/phase7-audit.txt', out);
  } catch { /* ignore */ }
}

main();
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/audit-factory-coverage.mjs
```

- [ ] **Step C1.2: Run the audit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
node scripts/sentinels/audit-factory-coverage.mjs 2>&1 | tee /tmp/phase7-audit.txt
```

The output lists entities used in ≥3 test files without a matching factory. If the list is empty: skip Task C2 entirely.

### Task C2: Add missing factories per audit

For each `MISSING:` entry in the audit, follow this pattern:

- [ ] **Step C2.1: Read the entity file**

```bash
cat museum-backend/src/<path-from-audit>
```

Identify required fields, default values that make sense, and any TypeScript wrinkles.

- [ ] **Step C2.2: Create the factory file**

Convention: `museum-backend/tests/helpers/<module>/<entity-camel>.fixtures.ts`. Example for `Museum`:

```ts
// museum-backend/tests/helpers/museum/museum.fixtures.ts
import { Museum } from '@modules/museum/domain/museum.entity';

export function makeMuseum(overrides: Partial<Museum> = {}): Museum {
  return {
    id: 'museum-001',
    name: 'Test Museum',
    city: 'Paris',
    country: 'France',
    // ... other required fields with sensible defaults ...
    ...overrides,
  } as Museum;
}
```

For each new factory:
- Use the entity's actual required fields (read the .entity.ts).
- Default to deterministic test values (no `Date.now()` unless seeded).
- Use `} as Entity;` cast — exempt because helper file.

- [ ] **Step C2.3: Optionally migrate test files that reference the entity**

If any test file constructs the entity inline AND the shape-match rule now catches it, migrate to use the new factory. If the audit didn't surface specific files, skip — the new factory is just for future use.

### Task C3: Run lint + tests

- [ ] **Step C3.1: Verify**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm lint 2>&1 | tail -5
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm test 2>&1 | tail -5
```

Expected: 0 lint errors, all tests still pass.

### Task C4: Anti-leak commit C

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add scripts/sentinels/audit-factory-coverage.mjs
# Plus any new factory files (paths depend on audit findings)
git add museum-backend/tests/helpers/ 2>/dev/null || true

git diff --cached --name-only | sort
```

```bash
git commit -m "$(cat <<'EOF'
test(factory): factory audit + add missing helpers (Phase 7 Group C)

Phase 7 Group C — coverage audit + closure of factory gaps.

- scripts/sentinels/audit-factory-coverage.mjs: one-off audit walks
  museum-backend/src/**/*.entity.ts, counts test references per
  entity, reports any used ≥3× without a matching tests/helpers/
  factory.
- For each MISSING entity surfaced by the audit, a new factory was
  added at tests/helpers/<module>/<entity>.fixtures.ts with
  make<Entity>(overrides) signature.

(See commit body for the per-entity diff if any factories were
added in this commit.)

Audit output (truncated in commit body — see /tmp/phase7-audit.txt
locally):

[paste the actual output of `node scripts/sentinels/audit-factory-coverage.mjs` here]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

If the audit returned an empty list and no new factories were added: skip Commit C entirely. The audit script itself is still valuable — commit it alone with a "ran clean as of 2026-05-01" body.

---

## Commit D — CLAUDE.md docs

### Task D1: Add Phase 7 subsection to CLAUDE.md

- [ ] **Step D1.1: Find insertion point**

```bash
grep -n "Phase 6\|chaos resilience\|## Test Discipline\|## Architecture" /Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md | head -10
```

The Phase 7 doc lives in two places:
- The "## Test Discipline" section (factory locations + how-to).
- A short Phase 7 line under the "Phase 0–6" CI subsections (if such a list exists).

- [ ] **Step D1.2: Append the subsection**

Use `Edit` to insert this right after the Phase 6 subsection (typically under "## CI"):

```markdown
### Factory locations + shape-match rule (Phase 7)

Test factories live by convention:
- BE: `museum-backend/tests/helpers/<module>/<entity>.fixtures.ts` (e.g., `tests/helpers/auth/user.fixtures.ts`).
- FE: `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts` (e.g., `__tests__/helpers/factories/auth.factories.ts`).

To add a new entity factory:
1. Create the file at the convention path.
2. Export `make<Entity>(overrides?: Partial<E>): E` returning a complete entity with sensible defaults.
3. The `} as Entity` cast lives ONLY in the helper file — test files import the factory.
4. Update `tools/eslint-plugin-musaium-test-discipline/src/rules/no-inline-test-entities.ts` `DEFAULT_SHAPE_SIGNATURES` to add the entity's signature so shape-match catches inline-anti-patterns.

Shape-match detection (Phase 7 extension to the no-inline-test-entities rule):
- Enabled via `detectShapeMatch: true` in BE + FE eslint configs.
- Fires on object literals matching ANY entity's signature prop set, even without a cast or annotation.
- Default signatures: User=[id,email,passwordHash], ChatMessage=[id,sessionId,role,text], ChatSession=[id,userId,locale,museumMode], Review=[id,rating,comment], SupportTicket=[id,userId,subject,description,status], MuseumEntity=[id,name,city,country], AuditEvent=[id,actorId,action,targetId].
- Exemptions: helper paths, factory call arguments (`makeUser({...})`), objects already covered by the 3 existing rule paths (cast / type-assertion / annotated declarator).

Phase 0 grandfather baseline shrunk to 0 in Phase 7. The cap test (`tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts`) enforces `PHASE_0_CAP = 0` — any future `as Entity` outside helpers triggers immediate gate fail.

See `docs/superpowers/specs/2026-05-01-phase7-factory-migration-design.md`.
```

### Task D2: Anti-leak commit D

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add CLAUDE.md
git diff --cached --name-only | sort
```

```bash
git commit -m "$(cat <<'EOF'
docs(claude-md): Phase 7 factory locations + shape-match rule (Phase 7 Group D)

Phase 7 Group D — closes Phase 7.

- CLAUDE.md: new subsection under Test Discipline documenting:
  - Factory file conventions (BE: tests/helpers/<module>/<entity>.fixtures.ts;
    FE: __tests__/helpers/factories/<entity>.factories.ts).
  - 4-step process for adding a new entity factory.
  - Shape-match rule semantics + default signatures + exemptions.
  - Phase 0 baseline shrunk to 0; cap test enforces PHASE_0_CAP=0.

Phase 7 closes. Phase 8 (coverage uplift gates) is the next milestone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -5
```

---

## Phase 7 Final Verification

- [ ] **Step F.1: All 4 commits landed**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git log --oneline -6
```

Expected: D, C (or skipped), B, A, prior commits.

- [ ] **Step F.2: Lint + cap green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm lint 2>&1 | tail -3
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend && npx eslint __tests__ 2>&1 | tail -3
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/tools/eslint-plugin-musaium-test-discipline && pnpm test 2>&1 | tail -5
```

- [ ] **Step F.3: Mark Phase 7 done in tracker**

Update tasks #49-#52 to completed.

---

## Out-of-Scope (Phase 8)

- Coverage threshold uplift across BE/FE/web (Phase 8).
- Mutation testing on factory helpers (out of scope; mutation focuses on production code).
- ADR for factory pattern (CLAUDE.md doc is sufficient).
- Frontend OpenAPI-typed entity factories (FE uses generated types — different pattern).
