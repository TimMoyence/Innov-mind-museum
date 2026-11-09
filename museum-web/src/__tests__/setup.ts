import '@testing-library/jest-dom/vitest';

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
