/**
 * Jest test environment for integration suites that drive the REAL
 * `onnxruntime-node` native binding (e.g. the SigLIP recall test).
 *
 * Why this exists
 * ---------------
 * Jest's default `node` environment runs each test file inside a fresh V8
 * context (vm sandbox) whose global typed-array constructors (`Float32Array`,
 * `Uint8Array`, …) are DISTINCT objects from the Node host realm's. The
 * `onnxruntime-node` native addon validates tensor data with an `instanceof`
 * check against the HOST realm's `Float32Array` — so a `Float32Array` produced
 * inside the sandbox (even a freshly-constructed one) fails at `session.run`
 * with:
 *   "A float32 tensor's data must be type of function Float32Array() ..."
 * even though the exact same code works in plain Node. This is a long-standing
 * jest ↔ native-addon realm mismatch (jest #2549 family), NOT a bug in the
 * adapter or the test.
 *
 * Fix
 * ---
 * This module file is loaded by jest in the HOST realm, so the typed-array
 * constructors captured here ARE the host realm's. We assign them onto the
 * sandbox `global` in the environment constructor, so any typed array created
 * inside the test passes the native addon's `instanceof` check.
 *
 * Scope: opt-in per-file via the `@jest-environment` docblock pragma — it does
 * NOT change the default `node` environment for the rest of the suite.
 */
const NodeEnvironment = require('jest-environment-node').default;

// Captured in the HOST realm (this file is not run inside the vm sandbox).
const HOST_TYPED_ARRAYS = {
  ArrayBuffer,
  SharedArrayBuffer,
  Float32Array,
  Float64Array,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  BigInt64Array,
  BigUint64Array,
  DataView,
};

class OnnxNodeEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    // Overwrite the sandbox globals with the host-realm constructors so native
    // addons (onnxruntime-node) accept typed arrays created inside this test.
    for (const [name, ctor] of Object.entries(HOST_TYPED_ARRAYS)) {
      this.global[name] = ctor;
    }
  }
}

module.exports = OnnxNodeEnvironment;
