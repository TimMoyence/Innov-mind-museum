export const TOP_BAR_COLLAPSE_THRESHOLD = 80;

export const TOP_BAR_EXPAND_THRESHOLD = 40;

export function deriveTopBarCollapsed(scrollY: number, previousCollapsed: boolean): boolean {
  if (previousCollapsed) {
    return scrollY >= TOP_BAR_EXPAND_THRESHOLD;
  }
  return scrollY >= TOP_BAR_COLLAPSE_THRESHOLD;
}
