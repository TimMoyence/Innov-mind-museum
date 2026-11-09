import type { Request } from 'express';

export function parseStringParam(req: Request, key: string): string | undefined {
  const value = req.params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
