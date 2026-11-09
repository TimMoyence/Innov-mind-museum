import { timingSafeEqual } from 'node:crypto';

export const sameSecret = (a: string, b: string | undefined): boolean => {
  if (b === undefined) return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  const length = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(length);
  const bPad = Buffer.alloc(length);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  return timingSafeEqual(aPad, bPad) && aBuf.length === bBuf.length;
};
