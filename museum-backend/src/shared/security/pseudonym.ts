import { createHash } from 'node:crypto';

export function pseudonymise(value: string | number, salt: string): string {
  return createHash('sha256')
    .update(`${salt}|${String(value)}`)
    .digest('hex')
    .slice(0, 16);
}
