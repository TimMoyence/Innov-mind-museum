/**
 * A11Y-01/03/04 — WCAG 1.4.3 / 1.4.11 contrast guard for semantic color tokens.
 *
 * Status badges (white text on a solid status color) and expertise badges
 * (level-colored text on an 8%-tint of the same color over the theme surface)
 * render at 11px bold = "normal text" → WCAG AA requires ≥ 4.5:1. The audit
 * found white-on-amber at 2.15:1 and the expertise light tints at 2.92–3.43:1.
 *
 * StarRating reuses `statusBadge.inProgress` as the star color (graphical object,
 * WCAG 1.4.11 ≥ 3:1) — covered transitively by the inProgress assertion.
 *
 * No RN rendering: pure math on the token hex values (mirror of
 * design-system/tokens/semantic.ts).
 */
import { semantic } from '@/shared/ui/tokens.semantic';

const AA_TEXT = 4.5;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite `fg` at `alpha` over opaque `bg`, return resulting hex. */
function blendOver(fg: string, alpha: number, bg: string): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const mix = (fc: number, bc: number) => Math.round(fc * alpha + bc * (1 - alpha));
  const channels = [mix(f[0], b[0]), mix(f[1], b[1]), mix(f[2], b[2])];
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ExpertiseBadge background = `${color}14` (alpha 0x14 = 20/255) over the surface.
const TINT_ALPHA = 0x14 / 255;
const SURFACE_LIGHT = '#FFFFFF';
const SURFACE_DARK = '#0F172A';

describe('semantic token contrast (WCAG AA)', () => {
  describe('statusBadge — white text on solid status color (A11Y-01)', () => {
    const { textColor, ...colors } = semantic.statusBadge;
    for (const [name, color] of Object.entries(colors)) {
      it(`${name} (${color}) has ≥ 4.5:1 against white text`, () => {
        expect(contrastRatio(textColor, color)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  });

  describe('expertiseLevels — colored text on 8% tint over surface (A11Y-03)', () => {
    for (const [level, pair] of Object.entries(semantic.expertiseLevels)) {
      it(`${level} light tint ≥ 4.5:1`, () => {
        const bg = blendOver(pair.light, TINT_ALPHA, SURFACE_LIGHT);
        expect(contrastRatio(pair.light, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      });
      it(`${level} dark tint ≥ 4.5:1`, () => {
        const bg = blendOver(pair.dark, TINT_ALPHA, SURFACE_DARK);
        expect(contrastRatio(pair.dark, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  });
});
