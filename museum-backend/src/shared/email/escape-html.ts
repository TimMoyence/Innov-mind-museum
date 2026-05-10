/**
 * HTML-entity escape for email templates and any other HTML rendering of user-controlled data.
 *
 * Order matters: `&` MUST be replaced first to avoid double-escaping the entities
 * we introduce immediately after.
 */
// nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization -- intentional HTML-entity escape chain for server-side rendering; order matters (& must be first)
export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
