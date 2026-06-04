/**
 * RED fixture (run 2026-06-04-hexagonal-boundaries-enforcement, T1.1) — CLEAN control.
 *
 * A domain-shaped source that imports ONLY from the domain layer (a sibling
 * `domain/**` entity). It is the negative control for the boundaries-rule
 * fixture-guard: when linted at the virtual path `src/modules/_fixture/domain/<file>.ts`,
 * it MUST yield ZERO `boundaries/dependencies` errors — both today (RED, rule
 * inert) and after the resolver is wired (GREEN, rule active). This proves the
 * rule does not over-fire on legitimate intra-domain imports.
 *
 * Type-only import → clean compilable module, no runtime side effects. Lives under
 * `tests/fixtures/**` (outside the production lint glob). NO `eslint-disable`.
 *
 * Frozen-test discipline (UFR-022): sha256-hashed in red-test-manifest.json;
 * the green phase MUST NOT modify it byte-for-byte.
 */

// Allowed intra-domain import (`domain/**` → `domain/**`).
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

export type CleanDomainAlias = ChatMessage;
