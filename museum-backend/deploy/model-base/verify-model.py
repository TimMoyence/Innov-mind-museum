#!/usr/bin/env python3
"""Validate the SigLIP-2 vision-encoder ONNX before baking it into the base image.

Asserts the file matches the pinned sha256 AND exposes the exact tensor contract
the runtime adapter (src/modules/chat/adapters/secondary/embeddings/
siglip-onnx.adapter.ts) depends on:

    input   pixel_values    (float)
    output  pooler_output   (..., 768)   <- the image embedding the adapter reads

Run this before `docker build` of deploy/model-base/Dockerfile.

    python3 verify-model.py [path-to.onnx]

Requires only: pip install onnxruntime numpy   (CPU is enough — no torch).
"""

import hashlib
import sys

import onnxruntime as ort

EXPECTED_SHA = "c0573e3f4140c3a7c4e9cc5912bd6b26a033b46a6a8e8af26cbea262b163bcad"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "siglip2-base-patch16-224.onnx"


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    actual = sha256(MODEL)
    if actual != EXPECTED_SHA:
        sys.exit(
            f"FAIL sha256 drift: expected {EXPECTED_SHA}, got {actual}. "
            "If you re-exported the model from source, re-pin EXPECTED_SHA here, "
            "in deploy/model-base/Dockerfile, in scripts/pull-siglip-model.sh, "
            "and in the siglip2-v1 base image tag."
        )

    sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
    inputs = {i.name: i for i in sess.get_inputs()}
    outputs = {o.name: o for o in sess.get_outputs()}

    if "pixel_values" not in inputs:
        sys.exit(f"FAIL missing input pixel_values; got {list(inputs)}")
    if "pooler_output" not in outputs:
        sys.exit(f"FAIL missing output pooler_output; got {list(outputs)}")
    if outputs["pooler_output"].shape[-1] != 768:
        sys.exit(f"FAIL pooler_output dim != 768: {outputs['pooler_output'].shape}")

    print(f"OK  {MODEL}")
    print(f"    sha256         {actual}")
    print(f"    input          pixel_values  {inputs['pixel_values'].shape}")
    print(f"    output         pooler_output {outputs['pooler_output'].shape}")


if __name__ == "__main__":
    main()
