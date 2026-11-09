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

describe('semantic token contrast (WCAG AA)', () => {
  describe('statusBadge — white text on solid status color (A11Y-01)', () => {
    const { textColor, ...colors } = semantic.statusBadge;
    for (const [name, color] of Object.entries(colors)) {
      it(`${name} (${color}) has ≥ 4.5:1 against white text`, () => {
        expect(contrastRatio(textColor, color)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  });
});
