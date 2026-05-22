# Lessons — sharp (v0.34.x)

Initial audit 2026-05-18 : **MOSTLY_COMPLIANT_WITH_3_GAPS**.
Refresh audit 2026-05-20 : **3 TD items STILL OPEN**, no new gaps surfaced.

## ⚠️ GAP-1 / TD-SHARP-01 MEDIUM : `.resize()` cap missing in EXIF-strip pipeline

- `museum-backend/src/modules/chat/adapters/secondary/image/image-processing.service.ts:50-82` — no `.resize()` in any of the 4 mime branches. A 24 Mpx phone photo gets re-encoded at full resolution → S3/LLM/mobile eat the full payload.
- **Fix** : add `.resize(4096, 4096, {fit:'inside', withoutEnlargement:true})` to all 4 branches OR drop `limitInputPixels` to `16_777_216` (4096²). Animated WebP/GIF must keep `{ animated: true }` and ensure the resize keeps frames.
- **Status (2026-05-20)** : still open.

## ⚠️ GAP-2 / TD-SHARP-02 MEDIUM : `.timeout()` missing on user-uploaded sharp chains

- PATTERNS.md §3 explicit "set both `limitInputPixels` AND `timeout` for user input". Default is **indefinite** ; a crafted slow-decode payload pins a libuv thread.
- **Fix** : `.timeout({seconds: 10})` on the user-facing chain ; `.timeout({seconds: 5})` on internal `preprocessForSiglip`.
- **Status (2026-05-20)** : still open.

## ⚠️ GAP-3 / TD-SHARP-03 LOW : `sharp.concurrency()` + `UV_THREADPOOL_SIZE` not pinned

- A burst of N parallel uploads → libvips saturates cores, competing with Express / Postgres / BullMQ.
- **Fix** : `sharp.concurrency(2)` in `src/bootstrap.ts` + `UV_THREADPOOL_SIZE=8` in the Dockerfile env.
- **Status (2026-05-20)** : still open.

## 🆕 2026-05-20 refresh — no new gaps

- Upstream releases since the audit (`0.34.4` 2025-09-17, `0.34.5` 2025-11-06) introduce zero API changes that affect the project. Bump from `0.34.0` → `0.34.5` is within the existing `^0.34.0` pin and recommended on the next `pnpm install`.
- `0.35.0` is still in -rc.x (5 release candidates between 2026-01 and 2026-04). Breaking changes incoming (Node 18 dropped → non-event since we run Node 22 ; `install` script removed ; AVIF metric flips ssim → iq). **Hold on 0.34.x.** Bump only after `0.35.1` ships.
- Security advisory scan : no new sharp-package advisories in 2024-2026 ; the libwebp CVE-2023-4863 is already covered by `^0.34.0`.

## ✅ Positives (audit 2026-05-18, still holds 2026-05-20)

- `sharp(buffer)` not filepath (no path traversal).
- `failOn: 'error'` explicit on both consumers.
- `limitInputPixels: 24_000_000` explicit on both consumers.
- SigLIP normalize `((x/255) - 0.5) / 0.5` = `(x/127.5) - 1.0` ∈ `[-1,+1]` — **CORRECT**, NOT ImageNet (per CLAUDE.md "Pièges connus" gotcha).
- `removeAlpha()` chain for SigLIP RGB input.
- Defensive `info.channels` + `data.length` shape check in `preprocessForSiglip` — bails loudly on sharp upgrade drift.
- `ImageDecodeError` 400 mapping — never leaks libvips internals to the caller.
- **No `.withMetadata()`** anywhere — GDPR Art. 5(1)(c) strip is structurally guaranteed by mime-driven format re-encode (`.jpeg()` / `.png()` / `.webp()` / `.gif()`).
- `.rotate()` before encoder for static branches — applies + clears EXIF orientation tag.
- Animated WebP/GIF branches keep `{ animated: true }` — frames preserved through re-encode.
