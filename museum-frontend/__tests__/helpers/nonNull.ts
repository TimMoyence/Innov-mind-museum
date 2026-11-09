export function nonNull<T>(
  value: T | null | undefined,
  message = 'expected non-null',
): NonNullable<T> {
  if (value == null) throw new Error(message);
  return value;
}
