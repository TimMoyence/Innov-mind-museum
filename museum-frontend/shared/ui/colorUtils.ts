/**
 * Returns the same color with alpha forced to 1 (fully opaque).
 *
 * - `rgba(R, G, B, A)` → `rgba(R, G, B, 1)` (RGB preserved verbatim)
 * - `rgb(R, G, B)`     → unchanged (already opaque)
 * - `#hex`             → unchanged (already opaque)
 * - Any unrecognized format → unchanged (defensive — caller's responsibility)
 *
 * Used by A3 to express the "user bubble = mat solide" rule WITHOUT introducing
 * a new design token — derived deterministically from the existing
 * `theme.userBubble` / `theme.assistantBubble` rgba values.
 *
 * Spec : docs/chat-ux-refonte/specs/A3.md §1.2 (R5-R8).
 */
const RGBA_RE = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[0-9.]+\s*\)$/;

export function forceOpaque(color: string): string {
  const match = RGBA_RE.exec(color);
  if (!match) return color;
  // Capture groups 1-3 are guaranteed by the regex match above. Default-to-''
  // destructure satisfies `noUncheckedIndexedAccess` without a runtime guard
  // or `as` cast.
  const [, r = '', g = '', b = ''] = match;
  return `rgba(${r}, ${g}, ${b}, 1)`;
}
