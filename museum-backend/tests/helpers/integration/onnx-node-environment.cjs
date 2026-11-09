const NodeEnvironment = require('jest-environment-node').default;

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
    for (const [name, ctor] of Object.entries(HOST_TYPED_ARRAYS)) {
      this.global[name] = ctor;
    }
  }
}

module.exports = OnnxNodeEnvironment;
