/**
 * Force axios to use the XHR adapter instead of the fetch adapter in tests.
 *
 * axios 1.15.0 auto-detects `fetch` in the global scope and uses a fetch-based
 * adapter with ReadableStream. The jest-expo environment provides a partial
 * fetch polyfill that triggers this path, but ReadableStream.cancel() throws
 * when the stream is locked, crashing tests.
 *
 * By removing the global fetch before axios loads, it falls back to the
 * XMLHttpRequest adapter which works correctly in the test environment.
 */
(globalThis as { fetch?: typeof fetch }).fetch = undefined;

/**
 * Seed @faker-js/faker for deterministic test data.
 *
 * Several factories (compare.factories, user.factories, …) call faker without
 * an explicit override on every field. With an unseeded RNG, these calls
 * produce different output across runs, which breaks `toMatchSnapshot()`
 * assertions (e.g. ImageCompareCarousel.test.tsx case 8 — flagged by the
 * Phase 8b green-editor on 2026-05-10). Snapshots that ARE meant to drift on
 * intentional UI changes still drift; what we want is determinism on the
 * generated-data axis only.
 *
 * `setupFiles` runs once before each test file's framework loads, so every
 * file gets the same starting RNG state. Within a file, faker state is then
 * advanced by each factory call in test order, which is itself deterministic.
 *
 * Constant `42` chosen for tradition; any fixed integer would do.
 */
import { faker } from '@faker-js/faker';
faker.seed(42);
