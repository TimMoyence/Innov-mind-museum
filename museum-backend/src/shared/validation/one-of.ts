import { invalidInput } from '@shared/errors/app.error';

export function assertOneOf<T extends string>(
  field: string,
  allowed: readonly T[],
  value: string,
): asserts value is T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw invalidInput(`${field} must be one of: ${allowed.join(', ')}`);
  }
}
