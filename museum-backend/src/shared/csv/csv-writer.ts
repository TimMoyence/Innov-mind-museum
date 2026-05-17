/**
 * RFC 4180 streaming CSV writer (R2 §3 D2). Zero npm deps.
 * Rules: CRLF separator, header = record, always quote-wrap fields, double
 * inner `"` → `""`. OWASP N8: prefix `'` when leading char is
 * `=`/`+`/`-`/`@`/`\t`/`\r` (stops Excel/LibreOffice formula execution).
 * BOM helper kept separate so route layer prepends once before header.
 */

export const UTF8_BOM: Buffer = Buffer.from([0xef, 0xbb, 0xbf]);

const DANGEROUS_LEADING_CHARS: ReadonlySet<string> = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Formula-injection prefix BEFORE quote wrapping so malicious leading char
 * becomes inert AND remains visible as data (Excel renders `'=cmd|...` as
 * literal text). Pure/sync.
 */
export function escapeCsvField(value: string): string {
  if (value.length === 0) {
    return value;
  }
  // OWASP N8 — neutralise leading formula trigger chars.
  let escaped = value;
  if (DANGEROUS_LEADING_CHARS.has(value.charAt(0))) {
    escaped = `'${value}`;
  }
  return escaped;
}

/** Doubles inner `"` per RFC 4180 §2.7. Writer always quote-wraps for predictable rows. */
function quoteField(escaped: string): string {
  const doubled = escaped.replace(/"/g, '""');
  return `"${doubled}"`;
}

/**
 * Serialises a record to a `\r\n`-terminated CSV line. Field order = iteration
 * order of input record (V8 preserves insertion order for string keys).
 */
export function writeCsvRow(record: Record<string, string>): string {
  const cells = Object.values(record).map((raw) => quoteField(escapeCsvField(raw)));
  return `${cells.join(',')}\r\n`;
}

/**
 * Spec §0.5 N2 — always prepend BOM (Excel-friendly, ignored by python/node
 * csv parsers, 3-byte cost). Returns copy so callers can't mutate singleton.
 */
export function writeBomHeader(): Buffer {
  return Buffer.from(UTF8_BOM);
}

/**
 * Header + rows. Decoupled from `res.write` so route can pipe to any sink.
 * Route is responsible for leading BOM via `writeBomHeader()`.
 *
 * @yields {string} the header line first, then one serialised CSV row per chunk.
 */
export async function* writeCsvStream(
  headers: readonly string[],
  rows: AsyncIterable<Record<string, string>>,
): AsyncIterable<string> {
  const headerRecord: Record<string, string> = {};
  for (const key of headers) {
    headerRecord[key] = key;
  }
  yield writeCsvRow(headerRecord);
  for await (const row of rows) {
    const ordered: Record<string, string> = {};
    for (const key of headers) {
      ordered[key] = row[key] ?? '';
    }
    yield writeCsvRow(ordered);
  }
}
