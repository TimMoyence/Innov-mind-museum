import { ValidationError } from '@shared/errors/app.error';

/**
 * SEC: trust boundary for SPARQL interpolation. Every public function that interpolates
 * into a SPARQL string MUST first call the matching `assert*`. Loose prefilters elsewhere
 * are non-security (catch `Q01`, homoglyphs, embedded newlines that bypass loose regex).
 *
 * @see {@link https://www.wikidata.org/wiki/Wikidata:Identifiers}
 */

/** Q1…Q999_999_999_999. Rejects Q0, Q01, Q-1, alpha. */
const WIKIDATA_ENTITY_ID = /^Q[1-9]\d{0,11}$/;
/** P1…P99_999_999. Rejects P0, P01, alpha. */
const WIKIDATA_PROPERTY_ID = /^P[1-9]\d{0,7}$/;
/** BCP47 base subtag (`en`, `fra`). */
const WIKIDATA_LANG_BASE = /^[a-z]{2,3}$/i;
/** BCP47 base + region/script (`zh-Hant`, `pt-BR`). */
const WIKIDATA_LANG_TAGGED = /^[a-z]{2,3}-[a-z]{2,4}$/i;

/** Truncation cap — never echo unbounded attacker payloads to logs. */
const ERROR_ECHO_MAX = 32;

function describeForError(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > ERROR_ECHO_MAX ? `${value.slice(0, ERROR_ECHO_MAX)}…` : value;
  }
  return `<${typeof value}>`;
}

/** @throws {ValidationError} on non-string or non-matching Q-number. */
export function assertEntityId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !WIKIDATA_ENTITY_ID.test(id)) {
    throw new ValidationError(`invalid Wikidata entity id: ${describeForError(id)}`);
  }
}

/** @throws {ValidationError} on non-string or non-matching P-number. */
export function assertPropertyId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !WIKIDATA_PROPERTY_ID.test(id)) {
    throw new ValidationError(`invalid Wikidata property id: ${describeForError(id)}`);
  }
}

/** @throws {ValidationError} on invalid BCP47 language tag. */
export function assertLang(lang: unknown): asserts lang is string {
  if (
    typeof lang !== 'string' ||
    (!WIKIDATA_LANG_BASE.test(lang) && !WIKIDATA_LANG_TAGGED.test(lang))
  ) {
    throw new ValidationError(`invalid Wikidata language tag: ${describeForError(lang)}`);
  }
}

/**
 * SEC: Escapes for SPARQL double-quoted literal. Doubles `\` + `"`, strips control
 * chars (\x00-\x1F, \x7F) — prevents quote-break + multi-line literal SPARQL injection.
 *
 * @throws {ValidationError} when `value` is not a string (callers MUST narrow first).
 */
export function escapeSparqlLiteral(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`invalid SPARQL literal: ${describeForError(value)}`);
  }
  // eslint-disable-next-line no-control-regex -- intentional: stripping control chars from user input is the security purpose
  const stripped = value.replace(/[\x00-\x1F\x7F]/g, ' ');
  return stripped.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
