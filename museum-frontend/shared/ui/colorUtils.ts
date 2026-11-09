const RGBA_RE = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[0-9.]+\s*\)$/;

export function forceOpaque(color: string): string {
  const match = RGBA_RE.exec(color);
  if (!match) return color;
  const [, r = '', g = '', b = ''] = match;
  return `rgba(${r}, ${g}, ${b}, 1)`;
}
