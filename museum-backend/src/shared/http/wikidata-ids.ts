import { ValidationError } from '@shared/errors/app.error';

const WIKIDATA_ENTITY_ID = /^Q[1-9]\d{0,11}$/;
const WIKIDATA_PROPERTY_ID = /^P[1-9]\d{0,7}$/;
const WIKIDATA_LANG_BASE = /^[a-z]{2,3}$/i;
const WIKIDATA_LANG_TAGGED = /^[a-z]{2,3}-[a-z]{2,4}$/i;

const ERROR_ECHO_MAX = 32;

function describeForError(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > ERROR_ECHO_MAX ? `${value.slice(0, ERROR_ECHO_MAX)}…` : value;
  }
  return `<${typeof value}>`;
}

export function assertEntityId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !WIKIDATA_ENTITY_ID.test(id)) {
    throw new ValidationError(`invalid Wikidata entity id: ${describeForError(id)}`);
  }
}

export function assertPropertyId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !WIKIDATA_PROPERTY_ID.test(id)) {
    throw new ValidationError(`invalid Wikidata property id: ${describeForError(id)}`);
  }
}

export function assertLang(lang: unknown): asserts lang is string {
  if (
    typeof lang !== 'string' ||
    (!WIKIDATA_LANG_BASE.test(lang) && !WIKIDATA_LANG_TAGGED.test(lang))
  ) {
    throw new ValidationError(`invalid Wikidata language tag: ${describeForError(lang)}`);
  }
}

export function escapeSparqlLiteral(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`invalid SPARQL literal: ${describeForError(value)}`);
  }
  const stripped = value.replace(/\p{Cc}/gu, ' ');
  return stripped.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
