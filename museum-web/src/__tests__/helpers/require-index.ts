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
