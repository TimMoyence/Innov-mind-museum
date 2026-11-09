export const UTF8_BOM: Buffer = Buffer.from([0xef, 0xbb, 0xbf]);

const DANGEROUS_LEADING_CHARS: ReadonlySet<string> = new Set(['=', '+', '-', '@', '\t', '\r']);

export function escapeCsvField(value: string): string {
  if (value.length === 0) {
    return value;
  }
  let escaped = value;
  if (DANGEROUS_LEADING_CHARS.has(value.charAt(0))) {
    escaped = `'${value}`;
  }
  return escaped;
}

function quoteField(escaped: string): string {
  const doubled = escaped.replace(/"/g, '""');
  return `"${doubled}"`;
}

export function writeCsvRow(record: Record<string, string>): string {
  const cells = Object.values(record).map((raw) => quoteField(escapeCsvField(raw)));
  return `${cells.join(',')}\r\n`;
}

export function writeBomHeader(): Buffer {
  return Buffer.from(UTF8_BOM);
}

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
