import '@testing-library/jest-dom/vitest';

/**
 * R2 — Blob.stream() polyfill for jsdom (used by the admin CSV export
 * button tests). jsdom's Blob lacks `stream()`, but the Web `Response`
 * constructor invokes it when the body is a Blob, which crashes tests
 * that build `new Response(new Blob([...]))` to mock a CSV download.
 *
 * The polyfill returns a minimal ReadableStream that emits the Blob's
 * bytes in one chunk then closes — sufficient for the contract under
 * test (status code + headers + body text matching).
 */
if (
  typeof Blob !== 'undefined' &&
  typeof (Blob.prototype as unknown as { stream?: unknown }).stream !== 'function'
) {
  (Blob.prototype as unknown as { stream: () => ReadableStream<Uint8Array> }).stream =
    function blobStreamPolyfill(this: Blob): ReadableStream<Uint8Array> {
      return new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.arrayBuffer()
            .then((buf) => {
              if (buf.byteLength > 0) controller.enqueue(new Uint8Array(buf));
              controller.close();
            })
            .catch((err: unknown) => {
              controller.error(err);
            });
        },
      });
    };
}
