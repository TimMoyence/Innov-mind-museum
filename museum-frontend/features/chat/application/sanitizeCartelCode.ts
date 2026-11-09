export const SANITIZE_MAX_LEN = 64;

const ZERO_WIDTH_AND_CONTROL_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\p{Cc}]/gu;

const FORBIDDEN_RE = /[^A-Za-z0-9._-]/g;

const ANGLE_BRACKET_RE = /[<>]/;

export function sanitizeCartelCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const normalised = raw.normalize('NFKC');
  const stripped = normalised.replace(ZERO_WIDTH_AND_CONTROL_RE, '');
  const angleIndex = stripped.search(ANGLE_BRACKET_RE);
  const truncated = angleIndex === -1 ? stripped : stripped.slice(0, angleIndex);
  const filtered = truncated.replace(FORBIDDEN_RE, '');
  const trimmed = filtered.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, SANITIZE_MAX_LEN);
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MusaiumDeeplink {
  readonly museumId: string;
  readonly artworkId: string;
  readonly roomId: string | null;
}

export function parseMusaiumDeeplink(raw: string): MusaiumDeeplink | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 256) return null;
  if (!trimmed.toLowerCase().startsWith('musaium://')) return null;

  if (trimmed.includes('#')) return null;

  const queryIdx = trimmed.indexOf('?');
  const pathPart = queryIdx === -1 ? trimmed : trimmed.slice(0, queryIdx);
  const queryPart = queryIdx === -1 ? null : trimmed.slice(queryIdx + 1);

  const body = pathPart.slice('musaium://'.length);
  const segments = body.split('/');
  if (segments.length !== 4) return null;
  const [host, museumId, artworkLiteral, artworkId] = segments as [string, string, string, string];
  if (host.toLowerCase() !== 'museum') return null;
  if (artworkLiteral.toLowerCase() !== 'artwork') return null;
  if (!UUID_V4_RE.test(museumId)) return null;
  if (!UUID_V4_RE.test(artworkId)) return null;

  let roomId: string | null = null;
  if (queryPart !== null) {
    if (queryPart.length === 0) return null;
    if (queryPart.includes('&')) return null;
    const eqIdx = queryPart.indexOf('=');
    if (eqIdx === -1) return null;
    const key = queryPart.slice(0, eqIdx);
    const value = queryPart.slice(eqIdx + 1);
    if (key.toLowerCase() !== 'room') return null;
    if (!UUID_V4_RE.test(value)) return null;
    roomId = value;
  }

  return { museumId, artworkId, roomId };
}
