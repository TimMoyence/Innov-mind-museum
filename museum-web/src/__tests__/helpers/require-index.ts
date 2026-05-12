/**
 * Test helper — strict indexed access with `noUncheckedIndexedAccess`.
 *
 * Throws (rather than failing silently with `undefined`) when an index is
 * out of bounds, giving a precise error message for test debugging. Use this
 * instead of `arr[i]!` so test code stays compatible with the project's
 * `@typescript-eslint/no-non-null-assertion` rule.
 */
export function requireIndex<T>(arr: readonly T[] | undefined, index: number, label = 'array'): T {
  if (arr === undefined) {
    throw new Error(`requireIndex: ${label} is undefined (expected length > ${String(index)})`);
  }
  const value = arr[index];
  if (value === undefined) {
    throw new Error(
      `requireIndex: ${label}[${String(index)}] is undefined (length=${String(arr.length)})`,
    );
  }
  return value;
}
