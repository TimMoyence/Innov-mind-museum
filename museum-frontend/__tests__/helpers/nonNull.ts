/**
 * Test helper: assert a value is non-null/undefined and return it narrowed.
 *
 * Used in tests after enabling `noUncheckedIndexedAccess` — array element
 * access (`arr[0]`) and `Map.get()` now return `T | undefined`, which the
 * test author often knows is safe but TypeScript can't prove.
 *
 * Prefer this helper over `arr[0]!` (rule `@typescript-eslint/no-non-null-assertion`)
 * — it throws a real Error with a useful message instead of crashing on `.foo of undefined`.
 */
export function nonNull<T>(value: T | null | undefined, message = 'expected non-null'): NonNullable<T> {
  if (value == null) throw new Error(message);
  return value;
}
