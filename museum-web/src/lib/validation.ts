/**
 * Shared client-side validation regexes (museum-web).
 *
 * Single source of truth for the small set of regexes that were historically
 * duplicated across forms (signup, B2B contact, admin museum create / branding).
 *
 * Sémantique = "structure basique côté client" — la BE reste autoritative.
 * Patterns préservés byte-for-byte par rapport aux définitions locales d'origine
 * (UFR-022 RUN_ID 2026-05-23-web-refactor-p1, spec U-R6.4 / UB-5).
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SLUG_RE = /^[a-z0-9-]+$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const HTTPS_RE = /^https:\/\/[^\s]+$/i;
export const KB_LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
