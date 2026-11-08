export const EMAIL_MAX_LENGTH = 254;

export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value);
}
