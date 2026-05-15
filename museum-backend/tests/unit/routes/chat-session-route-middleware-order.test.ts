/**
 * F1 RED — Sentinel regression test on `chat-session.route.ts` middleware
 * order. Pins F1 §1 R1 + Q2 (sentinel guardrail) BEFORE implementation.
 *
 * BUG (bug_001) at HEAD `2d9dfaa1` : the route declares
 *   `isAuthenticated → monthlySessionQuota → validateBody(createSessionSchema)`
 * which lets a Zod 400 burn a quota slot on a session that is never created.
 *
 * The fix swaps to
 *   `isAuthenticated → validateBody(createSessionSchema) → monthlySessionQuota`.
 *
 * This test is a CHEAP CI guardrail (Q2 default = YES) — future PRs that
 * silently swap the order back will fail this sentinel and stop on review.
 * The CLAUDE.md doctrine bullet is the human guardrail ; this is the machine
 * one.
 *
 * Implementation : the route file is loaded as TEXT (no module side-effects)
 * and the textual positions of the two identifiers within the POST handler
 * are compared. A tolerant `indexOf` lookup is used so cosmetic whitespace /
 * comment changes don't false-positive (F1.Risk3).
 *
 * MUST FAIL at HEAD `2d9dfaa1` — `monthlySessionQuota` currently precedes
 * `validateBody(createSessionSchema)` in the file.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('F1 sentinel — chat-session.route.ts middleware order', () => {
  const ROUTE_PATH = path.resolve(
    __dirname,
    '../../../src/modules/chat/adapters/primary/http/routes/chat-session.route.ts',
  );

  let source: string;

  beforeAll(() => {
    source = readFileSync(ROUTE_PATH, 'utf-8');
  });

  it('F1.Q2 — validateBody(createSessionSchema) appears BEFORE monthlySessionQuota in POST /sessions', () => {
    // Locate the POST '/sessions' route declaration. We anchor on the
    // 'router.post(' opener that contains the path literal '/sessions'.
    const postBlockStart = source.indexOf("router.post(\n    '/sessions'");
    expect(postBlockStart).toBeGreaterThanOrEqual(0);

    // Slice forward from the POST declaration to scope the position lookup.
    const postBlock = source.slice(postBlockStart);

    const validateIdx = postBlock.indexOf('validateBody(createSessionSchema)');
    const quotaIdx = postBlock.indexOf('monthlySessionQuota');

    // Both identifiers MUST appear in the POST block.
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(quotaIdx).toBeGreaterThanOrEqual(0);

    // F1 corrective : validateBody MUST come first so zod-400 short-circuits
    // before the quota UPDATE runs. At HEAD `2d9dfaa1` this assertion FAILS
    // because `monthlySessionQuota` (quotaIdx) is earlier than validateBody.
    expect(validateIdx).toBeLessThan(quotaIdx);
  });

  it('F1.Q2 — both middleware identifiers are still grep-able after green code lands', () => {
    // Tolerant regex guards — survives whitespace + comment reflows. If a
    // future refactor moves the middlewares into a composed helper, this
    // suite will need an update (Risk3) ; the CLAUDE.md doctrine bullet is
    // the human guardrail in that scenario.
    expect(source).toMatch(/validateBody\(createSessionSchema\)/);
    expect(source).toMatch(/monthlySessionQuota/);
  });
});
