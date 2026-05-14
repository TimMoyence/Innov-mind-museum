/**
 * RTL style audit helper.
 *
 * Walks a `toJSON()` tree from `@testing-library/react-native` and returns the
 * list of physical-side style props found in any node's style. Tests using this
 * assert that the returned list is empty — proving the screen does not ship
 * `marginLeft`/`marginRight`/`paddingLeft`/`paddingRight`/positional `left`/
 * `right` numeric values / `borderLeft*` / `borderRight*` / `textAlign: 'left'|'right'`,
 * any of which would break Arabic RTL.
 *
 * Exemptions (NOT flagged):
 *   - `left: 0` / `right: 0` (zero values are symmetric — both LTR and RTL).
 *   - `hitSlop` (RN auto-mirrors `hitSlop.left`/`.right` since 0.65).
 */

type Style = Record<string, unknown> | null | undefined;
type AnyNode =
  | { type?: string; props?: { style?: Style | Style[] }; children?: unknown }
  | string
  | null;

const PHYSICAL_KEYS = [
  'marginLeft',
  'marginRight',
  'paddingLeft',
  'paddingRight',
  'borderLeftWidth',
  'borderLeftColor',
  'borderRightWidth',
  'borderRightColor',
] as const;

function describeLeak(key: string, value: unknown, path: string): string {
  return `${path}.${key}=${JSON.stringify(value)}`;
}

function flattenStyle(style: Style | Style[]): Record<string, unknown>[] {
  if (!style) return [];
  if (Array.isArray(style)) {
    return style.flatMap((s) => flattenStyle(s));
  }
  if (typeof style === 'object') return [style];
  return [];
}

function checkStyle(style: Style | Style[], path: string): string[] {
  const leaks: string[] = [];
  for (const flat of flattenStyle(style)) {
    for (const key of PHYSICAL_KEYS) {
      if (key in flat) leaks.push(describeLeak(key, flat[key], path));
    }
    // positional `left` / `right` are leaks only when non-zero numeric
    if ('left' in flat && typeof flat.left === 'number' && flat.left !== 0) {
      leaks.push(describeLeak('left', flat.left, path));
    }
    if ('right' in flat && typeof flat.right === 'number' && flat.right !== 0) {
      leaks.push(describeLeak('right', flat.right, path));
    }
    if (flat.textAlign === 'left' || flat.textAlign === 'right') {
      leaks.push(describeLeak('textAlign', flat.textAlign, path));
    }
  }
  return leaks;
}

function walk(node: AnyNode, path: string, leaks: string[]): void {
  if (!node || typeof node === 'string') return;
  if (node.props?.style != null) {
    leaks.push(...checkStyle(node.props.style, `${path}<${node.type ?? '?'}>`));
  }
  const kids = Array.isArray(node.children) ? node.children : node.children ? [node.children] : [];
  kids.forEach((c, i) => { walk(c as AnyNode, `${path}/${i}`, leaks); });
}

/**
 * Returns the list of physical-side style leaks. Pass the result of
 * `screen.toJSON()` or `render(...).toJSON()`.
 */
export function findPhysicalSideLeaks(root: unknown): string[] {
  const leaks: string[] = [];
  const top = Array.isArray(root) ? root : [root];
  top.forEach((n, i) => { walk(n as AnyNode, `[${i}]`, leaks); });
  return leaks;
}
