/**
 * In-house RFC 4180 streaming CSV writer (R2 §3 D2).
 *
 * Zero npm dependency. Implements the 5 rules of RFC 4180 §2 :
 *  1. Records separated by `\r\n` (CRLF).
 *  2. Header row is just another record.
 *  3. Fields may be wrapped in double quotes.
 *  4. Fields containing `"`, `,`, `\r`, `\n` MUST be wrapped in double quotes.
 *  5. Inner double quotes MUST be doubled (`"` → `""`).
 *
 * Adds CSV-injection neutralisation (OWASP / spec §0.5 N8) :
 *  - Fields whose first char is `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed
 *    with a single quote `'` to stop Excel / LibreOffice from interpreting
 *    them as formulas.
 *
 * Adds a dedicated UTF-8 BOM emission helper so the route layer can prepend
 * the BOM exactly once (before the header row) — never embedded into per-row
 * output.
 */

/** Single-byte UTF-8 BOM buffer (EF BB BF). */
export const UTF8_BOM: Buffer = Buffer.from([0xef, 0xbb, 0xbf]);

const DANGEROUS_LEADING_CHARS: ReadonlySet<string> = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Escapes a single CSV field per RFC 4180 + OWASP N8 injection rules.
 *
 * Performs the formula-injection prefix BEFORE any quote wrapping, so that
 * the malicious leading char itself becomes inert AND remains visible as
 * data (Excel renders `'=cmd|...` as the literal text, never as a formula).
 *
 * Pure / synchronous / no side-effects.
 *
 * @param value - Raw cell text. Must already be a string.
 * @returns Escaped cell ready for `,`-joining into a CSV row.
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

/**
 * Wraps an already-injection-escaped field in double quotes, doubling any
 * inner `"` per RFC 4180 §2.7. Called for every cell — the CSV writer always
 * quotes cells so consumers reading row-by-row never need to second-guess.
 */
function quoteField(escaped: string): string {
  const doubled = escaped.replace(/"/g, '""');
  return `"${doubled}"`;
}

/**
 * Serialises one record to a CSV line terminated by `\r\n`.
 *
 * Field order is the iteration order of the input record (V8 preserves
 * insertion order for string keys). All cells are always quote-wrapped so
 * the contract is "every field is `"..."`" regardless of contents — keeps
 * the row predictable for downstream parsers and pin-able for tests.
 *
 * @param record - Map of column → cell value (already stringified upstream).
 * @returns RFC-4180 CSV line, single trailing `\r\n`.
 */
export function writeCsvRow(record: Record<string, string>): string {
  const cells = Object.values(record).map((raw) => quoteField(escapeCsvField(raw)));
  return `${cells.join(',')}\r\n`;
}

/**
 * Emits the UTF-8 BOM buffer.
 *
 * Spec §0.5 N2 — default position : always prepend BOM (Excel-friendly,
 * ignored by `csv` Python / Node parsers, 3-byte cost).
 *
 * @returns A fresh `Buffer` containing the 3 BOM bytes (EF BB BF).
 */
export function writeBomHeader(): Buffer {
  // Return a copy so callers cannot accidentally mutate the singleton.
  return Buffer.from(UTF8_BOM);
}

/**
 * Streams a header line followed by every row from `rows`, yielding strings.
 *
 * Decoupled from `res.write` so the route layer can pipe to any sink (HTTP
 * response, file, in-memory buffer for tests). The route is responsible for
 * the leading BOM via `writeBomHeader()`.
 *
 * @param headers - Ordered list of column keys for the header row + per-row
 *   key lookup. The serialised order of every data row mirrors this list.
 * @param rows - Async iterable of `Record<header, string>` data rows.
 * @yields {string} CSV chunks (header first, then one chunk per row).
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
