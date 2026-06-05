import crypto from 'node:crypto';

export function issueEmailToken(): { raw: string; hashed: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
}

export function hashEmailTokenForLookup(rawToken: string, opts: { trim?: boolean } = {}): string {
  const input = opts.trim === false ? rawToken : rawToken.trim();
  return crypto.createHash('sha256').update(input).digest('hex');
}
