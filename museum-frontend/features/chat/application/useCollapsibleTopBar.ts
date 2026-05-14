/**
 * A4 — Top bar collapsible au scroll.
 *
 * Pure scroll-collapse derivation with hysteresis for the chat top bar.
 * Mirrors `deriveHeroCollapsed` (A2) — same 80↓ / 40↑ thresholds for
 * inter-feature consistency (the same `onScroll` event drives both states).
 *
 *   - When NOT collapsed : collapse the moment `scrollY >= 80`.
 *   - When collapsed : stay collapsed until `scrollY < 40`.
 *
 * The 40dp band prevents flicker at the threshold while scrubbing. The
 * caller owns the `topBarCollapsed` state via `useState` ; this helper is
 * a side-effect-free reducer invoked from `onScroll`.
 *
 * Spec : `docs/chat-ux-refonte/specs/A4.md` §1.1 (R1-R7) + §4 (AC1-AC7).
 */

export const TOP_BAR_COLLAPSE_THRESHOLD = 80;

export const TOP_BAR_EXPAND_THRESHOLD = 40;

/**
 * Compute the next collapsed state given current scroll offset and previous
 * state. Pure — no internal memoization, no side effect, deterministic.
 */
export function deriveTopBarCollapsed(scrollY: number, previousCollapsed: boolean): boolean {
  if (previousCollapsed) {
    return scrollY >= TOP_BAR_EXPAND_THRESHOLD;
  }
  return scrollY >= TOP_BAR_COLLAPSE_THRESHOLD;
}
