/**
 * R2 RED tests — CSV writer (RFC 4180 + injection neutralisation + BOM).
 *
 * Pins R2 §1 R13 / R14 / R15 / R16 + §0.5 N1 / N2 / N8 down BEFORE implementation:
 *   - `writeCsvRow(record)` returns RFC-4180 row terminated by `\r\n`.
 *   - Quote-wraps fields containing `"`, `,`, `\n`, `\r`; doubles inner `"`.
 *   - Neutralises Excel formula injection on `=`, `+`, `-`, `@` (single-quote prefix).
 *   - Exposes a UTF-8 BOM emission helper.
 *
 * Production location (R2 §0.3) :
 *   museum-backend/src/shared/csv/csv-writer.ts
 *
 * MUST FAIL at baseline `a77e48aa` — the module does not exist yet.
 */
import { writeCsvRow, escapeCsvField, writeBomHeader } from '@shared/csv/csv-writer';

describe('csv-writer — RFC 4180 row emission (R2 R13/R14)', () => {
  it('emits a simple two-field row terminated by CRLF', () => {
    expect(writeCsvRow({ a: 'b', c: 'd' })).toBe('"b","d"\r\n');
  });

  it('wraps fields containing a comma in double quotes', () => {
    expect(writeCsvRow({ x: 'foo,bar' })).toBe('"foo,bar"\r\n');
  });

  it('wraps fields containing a literal newline in double quotes', () => {
    expect(writeCsvRow({ x: 'line1\nline2' })).toBe('"line1\nline2"\r\n');
  });

  it('wraps fields containing a literal CR in double quotes', () => {
    expect(writeCsvRow({ x: 'a\rb' })).toBe('"a\rb"\r\n');
  });

  it('doubles an inner double-quote (RFC 4180 §2.7)', () => {
    expect(writeCsvRow({ x: 'he said "hi"' })).toBe('"he said ""hi"""\r\n');
  });

  it('keeps multi-byte UTF-8 characters intact (é, 中, 🎨)', () => {
    const row = writeCsvRow({ a: 'café', b: '中文', c: '🎨' });
    expect(row).toContain('café');
    expect(row).toContain('中文');
    expect(row).toContain('🎨');
    expect(row.endsWith('\r\n')).toBe(true);
  });

  it('preserves the field order from the record', () => {
    const row = writeCsvRow({ z: '1', a: '2', m: '3' });
    expect(row).toBe('"1","2","3"\r\n');
  });

  it('emits an empty quoted cell for an empty string', () => {
    expect(writeCsvRow({ a: '', b: 'x' })).toBe('"","x"\r\n');
  });
});

describe('csv-writer — formula-injection neutralisation (R2 R15 / N8)', () => {
  it('prefixes leading `=` with a single quote', () => {
    expect(escapeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });

  it('prefixes leading `+` with a single quote', () => {
    expect(escapeCsvField('+1234')).toBe("'+1234");
  });

  it('prefixes leading `-` with a single quote', () => {
    expect(escapeCsvField('-cmd')).toBe("'-cmd");
  });

  it('prefixes leading `@` with a single quote', () => {
    expect(escapeCsvField('@user')).toBe("'@user");
  });

  it('prefixes leading TAB with a single quote', () => {
    expect(escapeCsvField('\tdata')).toBe("'\tdata");
  });

  it('prefixes leading CR with a single quote', () => {
    expect(escapeCsvField('\rfoo')).toBe("'\rfoo");
  });

  it('does NOT prefix regular alphanumeric content', () => {
    expect(escapeCsvField('Mona Lisa')).toBe('Mona Lisa');
  });

  it('does NOT prefix an in-the-middle equals (only leading char triggers)', () => {
    expect(escapeCsvField('rating=4')).toBe('rating=4');
  });

  it('writes the OWASP canonical malicious cell as harmless', () => {
    // R2 §0.5 N8 test fixture + AC7 — `=cmd|"powershell"!A1` becomes
    // single-quote-prefixed AND outer-quoted because of `,` inside cmd.
    const row = writeCsvRow({ comment: '=cmd|"powershell"!A1' });
    // The single-quote prefix is INSIDE the outer quotes; inner `"` doubled.
    expect(row).toBe('"\'=cmd|""powershell""!A1"\r\n');
  });
});

describe('csv-writer — UTF-8 BOM (R2 R16 / N2)', () => {
  it('writeBomHeader() returns the three BOM bytes EF BB BF', () => {
    const buf = writeBomHeader();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(buf.length).toBe(3);
  });

  it('BOM is not embedded into individual rows — only the dedicated helper emits it', () => {
    // Defensive : row writer must NEVER auto-prepend BOM; the route owns
    // BOM emission via `writeBomHeader()` once before the header row.
    const row = writeCsvRow({ a: 'b' });
    expect(row.charCodeAt(0)).not.toBe(0xfeff); // no UTF-16 BOM
    expect(row.startsWith('﻿')).toBe(false); // no UTF-8 BOM via str
  });
});
