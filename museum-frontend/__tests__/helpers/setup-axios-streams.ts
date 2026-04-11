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
