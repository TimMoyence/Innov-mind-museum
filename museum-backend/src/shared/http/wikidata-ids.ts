import { ValidationError } from '@shared/errors/app.error';

/**
 * Strict validators for Wikidata identifiers + SPARQL literal escaping.
 *
 * Defense-in-depth layer: every public function that interpolates a value into
 * a SPARQL string MUST first call the matching `assert*` here. The pre-existing
 * loose regex prefilter (`/^Q\d+$/`) MAY remain for early rejection but is no
 * longer security-critical — these assertions are the trust boundary.
 *
 * Why both layers? Belt-and-braces: prefilter is cheap and runs at the call
 * site; assertions catch bypasses (e.g. `Q01`, homoglyphs, embedded newlines)
 * that the loose regex accepts.
 *
 * @see {@link https://www.wikidata.org/wiki/Wikidata:Identifiers Wikidata identifier conventions}
 */

/** Wikidata entity id: `Q1` … `Q999_999_999_999`. Rejects `Q0`, `Q01`, `Q-1`, alpha. */
const WIKIDATA_ENTITY_ID = /^Q[1-9]\d{0,11}$/;

/** Wikidata property id: `P1` … `P99_999_999`. Rejects `P0`, `P01`, alpha. */
const WIKIDATA_PROPERTY_ID = /^P[1-9]\d{0,7}$/;

/** BCP47 base subtag: `en`, `fra`. ASCII alpha, 2-3 chars. */
const WIKIDATA_LANG_BASE = /^[a-z]{2,3}$/i;
/** BCP47 base + region/script subtag: `zh-Hant`, `pt-BR`. */
const WIKIDATA_LANG_TAGGED = /^[a-z]{2,3}-[a-z]{2,4}$/i;

/** Truncation cap for echoing attacker input back into error messages / logs. */
const ERROR_ECHO_MAX = 32;

/**
 * Renders an unknown value into a short, log-safe placeholder.
 *
 * Strings are truncated to {@link ERROR_ECHO_MAX} chars; non-strings fall back
 * to their `typeof` so we never echo unbounded attacker payloads to logs.
 */
function describeForError(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > ERROR_ECHO_MAX ? `${value.slice(0, ERROR_ECHO_MAX)}…` : value;
  }
  return `<${typeof value}>`;
}

/**
 * Asserts that `id` is a syntactically valid Wikidata entity id (Q-number).
 *
 * Throws {@link ValidationError} on any non-string or any string that fails
 * {@link WIKIDATA_ENTITY_ID}. Anchored regex rejects partial matches and
 * leading-zero / negative / alpha forms.
 *
 * @param id - Caller-supplied value to validate.
 * @throws {ValidationError} when `id` is not a valid Wikidata entity id.
 */
export function assertEntityId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !WIKIDATA_ENTITY_ID.test(id)) {
    throw new ValidationError(`invalid Wikidata entity id: ${describeForError(id)}`);
  }
}

/**
 * Asserts that `id` is a syntactically valid Wikidata property id (P-number).
 *
 * @param id - Caller-supplied value to validate.
 * @throws {ValidationError} when `id` is not a valid Wikidata property id.
 */
export function assertPropertyId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !WIKIDATA_PROPERTY_ID.test(id)) {
    throw new ValidationError(`invalid Wikidata property id: ${describeForError(id)}`);
  }
}

/**
 * Asserts that `lang` is a syntactically valid Wikidata language tag.
 *
 * @param lang - Caller-supplied value to validate.
 * @throws {ValidationError} when `lang` is not a valid language tag.
 */
export function assertLang(lang: unknown): asserts lang is string {
  if (
    typeof lang !== 'string' ||
    (!WIKIDATA_LANG_BASE.test(lang) && !WIKIDATA_LANG_TAGGED.test(lang))
  ) {
    throw new ValidationError(`invalid Wikidata language tag: ${describeForError(lang)}`);
  }
}

/**
 * Escapes a string for safe interpolation inside a SPARQL double-quoted literal.
 *
 * Doubles backslashes + double-quotes, strips control chars (`\x00-\x1F`, `\x7F`).
 * Newlines are stripped because a multi-line string literal would let an
 * attacker append arbitrary SPARQL after the closing quote.
 *
 * Throws {@link ValidationError} if `value` is not a string — callers MUST
 * narrow to `string` before passing user input.
 *
 * @param value - Caller-supplied user string (e.g. museum label).
 * @returns Escaped string safe to drop between SPARQL `"…"` quotes.
 * @throws {ValidationError} when `value` is not a string.
 */
export function escapeSparqlLiteral(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`invalid SPARQL literal: ${describeForError(value)}`);
  }
  // Strip control chars (incl. newline / CR / tab / NUL); SPARQL string literals
  // disallow raw control chars, and stripping them eliminates a class of
  // breakouts from the surrounding quoted context.
  // eslint-disable-next-line no-control-regex -- intentional: stripping control chars from user input is the security purpose
  const stripped = value.replace(/[\x00-\x1F\x7F]/g, ' ');
  return stripped.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
