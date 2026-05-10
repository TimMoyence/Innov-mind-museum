/**
 * HTML-entity escape for email templates and any other HTML rendering of user-controlled data.
 *
 * Single-pass `String.replace` with a class regex avoids the order-of-operations
 * footgun of chained `replaceAll` (where `&` must run before `&amp;` would
 * double-escape) and the semgrep `detect-replaceall-sanitization` rule.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
