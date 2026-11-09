export const nonEmpty = <T extends string>(value: T | null | undefined): T | undefined =>
  value === null || value === undefined || value === '' ? undefined : value;
