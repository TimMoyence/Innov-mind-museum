# Lessons — sharp (v0.34.0)

Audit 2026-05-18 : **MOSTLY_COMPLIANT_WITH_3_GAPS**.

## ⚠️ GAP-1 MEDIUM : .resize() cap missing in EXIF-strip pipeline
- `image-processing.service.ts:50-82` — no `.resize()` in any branch. 24Mpx images get re-encoded full-resolution → S3/LLM/mobile eat full payload.
- **Fix TD-SHARP-01** : Add `.resize(4096, 4096, {fit:'inside', withoutEnlargement:true})` ou drop limitInputPixels à 16_777_216 (4096²). Animated WebP/GIF needs per-frame.

## ⚠️ GAP-2 MEDIUM : .timeout() missing on user-uploaded sharp chains
- PATTERNS §3 explicit "set both limitInputPixels AND timeout pour user input". Default = indefinite → crafted slow-decode payload pin libuv thread.
- **Fix TD-SHARP-02** : `.timeout({seconds:10})` on user-facing chain ; `.timeout({seconds:5})` on internal preprocessForSiglip.

## ⚠️ GAP-3 LOW : sharp.concurrency() + UV_THREADPOOL_SIZE not pinned
- Burst N parallel uploads → libvips saturate cores, competes with Express/Postgres/BullMQ.
- **Fix TD-SHARP-03** : `sharp.concurrency(2)` in bootstrap + `UV_THREADPOOL_SIZE=8` in Dockerfile env.

## ✅ Positives
- `sharp(buffer)` not filepath (no path traversal) ; `failOn:'error'` explicit ; `limitInputPixels:24M` ; SigLIP normalize `(x/127.5)-1` CORRECT (NOT ImageNet — CLAUDE.md gotcha) ; removeAlpha for SigLIP RGB ; ImageDecodeError 400 mapping ; no `.withMetadata()` (GDPR strip OK).
