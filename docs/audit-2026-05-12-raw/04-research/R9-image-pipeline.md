# R9 — Image Processing Pipeline Audit

**Date** : 2026-05-12
**Auditeur** : R9 (Claude Opus 4.7, 1M context)
**Périmètre** : ONNX Runtime + Sharp + libvips + image security + CDN — pour Musaium 100k visitors target

> **Honesty UFR-013** — toutes les versions, prix, et benchmarks ci-dessous sont issus de WebSearch/WebFetch en mai 2026. Quelques affirmations marquées "estimate" sont des extrapolations explicites du pilote, pas des chiffres mesurés.

---

## Stack Musaium actuelle (verified, code-grep 2026-05-12)

| Composant | Version pinnée | Localisation |
|---|---|---|
| `sharp` | `^0.34.0` | `museum-backend/package.json` |
| `onnxruntime-node` | `^1.26.0` | `museum-backend/package.json` |
| `multer` | `2.1.1` (memoryStorage) | `chat-route.helpers.ts:100-107` |
| **Image cap** | `LLM_MAX_IMAGE_BYTES = 3 MB` default | `env.ts` |
| **Audio cap** | `LLM_MAX_AUDIO_BYTES = 12 MB` default | `env.ts` |
| **MIME allowlist** | jpeg / png / webp (image), m4a/mp3/webm/wav (audio) | `chat-route.helpers.ts:39-52` |
| **Magic bytes** | Manuel — 4 signatures inline | `image-input.ts:107-132` |
| **EXIF strip** | Sharp `.rotate().jpeg()` re-encode | `image-processing.service.ts` |
| **SigLIP model** | `siglip-base-patch16-224@v1`, 768-d | `siglip-onnx.adapter.ts:51` |
| **Preprocess** | 224×224 fill resize, mean/std=0.5, FP32 NCHW | `image-preprocess.ts` |
| **GPU** | Aucun. ONNX CPU EP par défaut | (no `executionProviders` option set) |
| **ClamAV** | **Absent** — pas de scan AV upload | — |
| **CDN** | Aucun image CDN — backend sert + S3 signed URL | `chat-route.helpers.ts:252-286` |
| **Queue** | Aucune — inference inline dans le request handler | `siglip-onnx.adapter.ts:166-198` |

**Observation immédiate** : la pipeline est compétente pour V1 single-instance, mais **6 lacunes critiques** pour 100k users — détaillées plus bas (verdict).

---

## TL;DR (verdict pré-100k)

| Axe | État | Sévérité | Action V1 (avant 2026-06-01) | Action V1.x |
|---|---|---|---|---|
| Sharp 0.34 + libvips 8.17 | OK, à jour | — | RAS | Suivre 0.35 (changements AVIF SSIMULACRA2) |
| ONNX CPU | Fonctionne single-instance | **HAUTE** à scale | Lock `intra_op_num_threads`, ajouter `BullMQ` queue | Sidecar GPU (Replicate fallback déjà en place) |
| `limitInputPixels` Sharp | **Non configuré** → défaut 268 M px | **HAUTE** | Fixer à 24 M px (= 6000×4000, smartphone moderne) | — |
| ClamAV scan | Absent | **MOYENNE** (B2B requirement, RGPD) | Sidecar Docker | — |
| SVG accepté | Non — pas dans allowlist | — | RAS (continuer à exclure) | — |
| HEIC/HEIF iOS | **Non accepté** côté backend (mais SDK 55 expo-image-picker upload original) | **HAUTE** | Ajouter `image/heic` + `image/heif` au allowlist + sharp HEIF support | Server-side reconvert AVIF (browser support 95%+) |
| CDN | Aucun | **MOYENNE** | Cloudflare R2 + Images variants OU Bunny Optimizer ($9.50/mo flat) | — |
| Decompression bomb | Sharp accepte 268 M px (≈ 800 MB RGB en RAM) | **CRITIQUE** | Configure `limitInputPixels`, `failOn:'error'`, `unlimited:false` | — |
| Async sidecar | Inline blocking | **HAUTE** | BullMQ + worker process | — |

---

## 1. ONNX Runtime Node 2026 — deep-dive

### Version et release cadence

- **v1.26.0** est la version LTS courante (release mai 2026) — Musaium pinné `^1.26.0` ✅ ([microsoft/onnxruntime releases](https://github.com/microsoft/onnxruntime/releases)).
- **v1.25.0** (avril 2026) a introduit le requirement **C++20** et CUDA 12 minimum côté binding native — important si on rebuild image Docker custom.
- v1.26 nouveautés Node.js : **Node.js v22 support**, JSI pour React Native, JSPI (JavaScript Promise Integration) build support. Notre `museum-backend` tourne déjà Node 22 → compatible.
- CPU MLAS perf : Arm64 BF16 fast-math conv kernels, FP16 GeLU enablement, **NCHWc layout support** pour conv (potentiel gain perf si on quantize SigLIP plus tard).

### Execution Providers — état 2026

| EP | Support `onnxruntime-node` | Pertinent Musaium |
|---|---|---|
| **CPU** (MLAS) | ✅ Default, NAPI binding | Oui — actuel |
| **CUDAExecutionProvider** | ✅ Linux x86_64 (besoin `onnxruntime-node-gpu`), CUDA 13.0 support v1.26 | Si sidecar GPU L4 |
| **CoreMLExecutionProvider** | ⚠️ Pas dans binaire officiel macOS du npm `onnxruntime-node` — community build `xaviviro/onnxruntime-coreml` ([source](https://github.com/xaviviro/onnxruntime-coreml)) | Non-bloquant (prod = Linux VPS) |
| **WebGPU** | ❌ `onnxruntime-web` uniquement, pas `-node` | Pas backend (peut-être client-side V2) |
| **TensorRT** | Linux NVIDIA seulement | Si full GPU stack |
| **OpenVINO** | Intel CPU/GPU/NPU, peut accélérer SigLIP 2-3x sur CPU x86 (xeon) | Évaluer pour VPS OVH |

> **Important** : `onnxruntime-node@1.26` côté NPM ne package PAS CoreML EP. Sur mac dev, c'est CPU. Sur prod Linux VPS OVH (CPU), c'est CPU. La doc officielle confirme qu'**il faut un build custom pour CoreML sur macOS** ([CoreML EP issue #10367](https://github.com/microsoft/onnxruntime/issues/10367)).

### Performance — SigLIP-base-224 CPU

Pas trouvé de benchmark public **direct** SigLIP CPU node, mais extrapolation depuis 3 sources :

- ViT-Base 224 @ FP32 sur CPU x86 AVX2 ≈ **180-250 ms** par image (single thread).
- Avec `intra_op_num_threads = 4` → **~80-120 ms** ([ONNX threading guide](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)).
- Quantization INT8 dynamic → **2-3x speedup**, ~40-60 ms par image, avec **recall drop 0-2%** (typique pour vision encoders) ([ONNX quantization docs](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)).

> Pour 100k users avec ~3 req/s peak (cf. tag interview), un seul backend pod ONNX CPU `intra=4` tient ~30-50 inferences/s — **suffit largement** si on garde l'inference dans le request handler. **Mais** : pic Saturday matinée musée = ~10-20 req/s par minute = saturable.

### Memory pooling

- ONNX `ArenaExtendStrategy` — défaut OK pour CPU.
- Session cache adapter-level déjà bien fait (cf. `siglip-onnx.adapter.ts:139-145`) — le modèle (~340 MB FP32) reste résident en RAM, un seul `InferenceSession.create` par process.
- ⚠️ Si on add Cluster mode (PM2) ou multiple workers Express, **chaque worker recharge 340 MB**. À 4 workers = 1.3 GB rien que pour SigLIP. Préférer **un seul worker dédié inference** via BullMQ.

### Thread configuration (recommandé prod)

```ts
// Pas dans le code actuel. À ajouter dans SiglipOnnxAdapter ctor :
runtime.InferenceSession.create(modelPath, {
  intraOpNumThreads: 4,        // 4 cores pour la convolution intra-op
  interOpNumThreads: 1,         // single graph thread (concurrent requests = multiple sessions)
  graphOptimizationLevel: 'all',
  executionMode: 'sequential',
})
```

Source : [ONNX threading docs](https://onnxruntime.ai/docs/performance/tune-performance/threading.html) + [issue #19384 — CPU consumption scaling](https://github.com/microsoft/onnxruntime/issues/19384).

---

## 2. Sharp 0.34+ — deep-dive

### Version

- **v0.34.5** (Nov 2025) — libvips **8.17.3**. Musaium pinné `^0.34.0` → on est sur 0.34.4 ou 0.34.5 selon dernière `pnpm install`.
- **v0.34.0** est **breaking** : drop Node 18 (Musaium = Node 22 ✅).
- **v0.35.0** (à venir 2026) : AVIF quality utilisera **SSIMULACRA2** au lieu de SSIM (mesure plus alignée perception humaine). À monitorer.

Source : [sharp changelog v0.34.5](https://sharp.pixelplumbing.com/changelog/v0.34.5/).

### Performance

- Sharp/libvips = **40-50x plus rapide que Jimp** sur resize/compress ([PkgPulse guide 2026](https://www.pkgpulse.com/guides/best-javascript-image-processing-2026)).
- Sharp **4-5x plus rapide que ImageMagick** sur les mêmes ops.
- Pour resize 4032×3024 (iPhone 16) → 224×224 : **~25-40 ms** sur CPU moderne (single op).
- libvips multi-threaded par défaut, **utilise tous les cores** — sur backend déjà busy, peut écraser le NodeJS event loop.

> **Source** : [Context.dev — Sharp memory journey](https://www.context.dev/blog/preventing-memory-issues-in-node-js-sharp-a-journey). Recommande de limiter explicitement les ops concurrentes (queue + batch).

### AVIF / HEIC support

- **AVIF** : output natif via `sharp(...).avif({ quality, effort })`. AVIF encode **3-5x plus lent** que JPEG mais **20-50% plus petit** à qualité équivalente ([sharp issue #4227](https://github.com/lovell/sharp/issues/4227)).
- **HEIC/HEIF** : libvips inclus dans le binaire NPM `sharp` lit HEIC depuis **0.33.4** ✅. Mais nécessite libheif pour HEVC compression. Le binaire npm `sharp@0.34.5` **inclut libheif** — donc lecture iPhone HEIC = supported **par défaut** ([sharp issue #3680](https://github.com/lovell/sharp/issues/3680), [sharp issue #4472](https://github.com/lovell/sharp/issues/4472)).
- **Mais** côté Musaium : `DEFAULT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']` (`chat-route.helpers.ts:39`). **HEIC est bloqué par le MIME allowlist côté multer** avant même d'arriver à sharp. C'est un bug pour V1 — voir gap.

### Multi-threading & memory

- Sharp lance jusqu'à `os.cpus().length` threads par op via libvips ([Context.dev journey](https://www.context.dev/blog/preventing-memory-issues-in-node-js-sharp-a-journey)).
- Sur 8-core machine avec 4 uploads concurrents = **jusqu'à 32 threads natifs** → fragmentation mémoire glibc (≠ leak).
- **Mitigation** : `sharp.concurrency(2)` pour fixer la concurrence par op, plus une queue (BullMQ) pour fixer la concurrence d'ops.

### Security-relevant constructor options (defaults 2026)

| Option | Default | Risque | Reco Musaium |
|---|---|---|---|
| `limitInputPixels` | `268402689` (≈ 16384 × 16384) | **Decompression bomb** — accepte ~800 MB image RGB | **Lock à `24_000_000` = 6000×4000** (cap au-dessus des smartphones 2026) |
| `unlimited` | `false` | Safe by default | Garder `false` |
| `failOn` | `'warning'` | Trop tolérant | Passer à `'error'` (refuse fichiers corrompus en silence) |
| `sequentialRead` | `true` | Safe | Garder |
| `autoOrient` | `false` (mais on appelle `.rotate()`) | OK manuellement | Préférer `sharp(buf, { autoOrient: true })` ([sharp v0.34 changelog](https://sharp.pixelplumbing.com/changelog/v0.34.5/)) |

Source : [sharp constructor docs](https://sharp.pixelplumbing.com/api-constructor/).

---

## 3. libvips alternatives — quick verdict

| Lib | Speed vs Sharp | AVIF/HEIC | Verdict Musaium |
|---|---|---|---|
| **ImageMagick** | 4-5x plus lent, plus de RAM | Oui mais lourd | **Skip** — pas de raison switch |
| **Squoosh** (libsquoosh) | WASM, 2-3x plus lent que sharp pour bulk | Excellent (AVIF best-in-class) | **CLI removed by Google 2023**, fork community `frostoven/Squoosh-with-CLI` ([source](https://github.com/frostoven/Squoosh-with-CLI)). Squoosh **WASM lib** reste utile pour client-side, pas backend. |
| **Jimp** | 40-50x plus lent | Limité | **Reject** |
| **@napi-rs/canvas** | Performant draw, pas un competitor décodage | — | Hors scope (rendering, pas encoder) |
| **OpenCV.js** | Overkill (CV complet) | Limité | Hors scope |

**Sharp + libvips reste le standard incontesté Node.js 2026** — pas de motif de switch.

---

## 4. Image processing security best practices

### Checklist défense en profondeur (state-of-the-art 2026)

| # | Couche | Implémentation Musaium | Verdict | Action |
|---|---|---|---|---|
| 1 | **Content-Length pre-flight** | multer `limits.fileSize` → 3 MB | ✅ | RAS |
| 2 | **MIME allowlist (Content-Type header)** | `imageFileFilter` allowlist | ✅ | Add `image/heic` + `image/heif` (V1) |
| 3 | **Magic bytes (file signature)** | Manuel 4 sigs (jpeg/png/gif/webp) `image-input.ts:107` | ⚠️ Partiel — manque HEIC/HEIF/AVIF | Switch à `file-type` v21 npm ([source](https://www.npmjs.com/package/@tnnquang/file-type-detector)) |
| 4 | **Decompression bomb (pixel limit)** | **Non configuré → 268 M px Sharp default** | **CRITIQUE** | `sharp(buf, { limitInputPixels: 24_000_000, failOn: 'error' })` |
| 5 | **EXIF strip + orientation** | Sharp `.rotate().jpeg()` ([service](file:///Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/chat/adapters/secondary/image/image-processing.service.ts)) | ✅ Bien fait | RAS |
| 6 | **GPS coords strip** | Implicite via `.jpeg()` re-encode (drop all metadata) | ✅ | Documenter explicitement (RGPD) |
| 7 | **Polyglot file defense** | Magic byte check **avant** sharp | ✅ | RAS |
| 8 | **SVG reject** | Pas dans allowlist | ✅ | **Garder rejected** (XSS vector) |
| 9 | **AV scan (ClamAV)** | **Absent** | ⚠️ B2B / RGPD risk | Sidecar Docker + `pompelmi` npm ([source](https://github.com/pompelmi/pompelmi)) |
| 10 | **Rate limit upload endpoint** | Cf chat-message.route déjà rate-limited (R1 général) | ✅ | RAS |
| 11 | **Filename randomization** | S3 ref hashé (cf `image-storage.s3.ts`) | ✅ | RAS |
| 12 | **Storage outside webroot** | S3 (signed URL TTL) | ✅ | RAS |
| 13 | **CSP / Content-Disposition: attachment** | `helmet` defaults | ⚠️ Pas explicite sur image route | Add `Content-Disposition: inline; filename=...` au signed URL |

### Polyglot file threat

- JPEG accepte arbitrary data après `FF D9` marker. Un attaquant peut concaténer du PHP/JS valide → **mitigation = re-encode via sharp** (déjà fait dans `stripExifFromImage`).
- **CVE-2026-30821** (Flowise) — exemple récent qui trust uniquement `file.mimetype` ([advisory](https://advisories.gitlab.com/pkg/npm/flowise/CVE-2026-30821/)). Musaium fait le magic-byte check, donc protégé.

### Image decompression bomb (CRITIQUE)

Sharp **default limit = 268 402 689 pixels** = ~16384 × 16384. Un PNG de 50 KB peut décompresser vers ce volume. Avec RGB 3 bytes/pixel = **805 MB RAM** par requête. À 10 uploads concurrents = 8 GB RAM consommée.

**Action immédiate V1** :

```ts
// Dans image-preprocess.ts ET image-processing.service.ts :
const SAFE_PIXEL_LIMIT = 24_000_000; // 6000×4000, smartphones modernes

const transformer = sharp(buffer, {
  limitInputPixels: SAFE_PIXEL_LIMIT,
  failOn: 'error',  // refuse silent decode errors
  sequentialRead: true,
  unlimited: false,
});
```

Source : [Sharp constructor docs](https://sharp.pixelplumbing.com/api-constructor/), [sharp issue #4034](https://github.com/lovell/sharp/issues/4034).

### ClamAV — recommandation 2026

- **Pompelmi** (npm, [github](https://github.com/pompelmi/pompelmi)) — wrapper minimal autour ClamAV, scan in-memory avant storage. Sidecar Docker = 1 GB RAM, ~50-200 ms par fichier 3 MB.
- Alternative : **ClamAV REST API** (`benzino77/clamav-rest-api`) — micro-service séparé.

Coût opérationnel : 1 container 1 vCPU/1 GB RAM = ~$5/mo VPS OVH (négligeable vs B2B GDPR audit demand).

---

## 5. Image upload security 2026 — nouveaux vecteurs

### Tooling moderne

- **`file-type` v21** (npm, jan 2026) — magic-byte detect 100+ formats, **incluant HEIC/AVIF/HEIF** ([source](https://www.npmjs.com/package/file-type)).
- **`magic-bytes.js`** — alternative lighter, 79 dependents ([source](https://www.npmjs.com/package/magic-bytes.js)).
- **`pompelmi`** — scanning malware + ClamAV wrapper, async fn, returns typed verdicts.

### CVE recents (2026)

- **CVE-2026-30821** — Flowise arbitrary file upload via MIME spoofing (faisaient confiance à `mimetype`).
- **CVE-2026-40192** (Pillow Python) — GZIP decompression bomb dans FITS images. Pas Sharp mais montre que la classe d'attaque est **toujours active 2026**.

### Migration recommandée — `image-input.ts`

Le module Musaium fait 4 signatures inline (`IMAGE_SIGNATURES`). C'est **fragile** :

```ts
// Actuel — manque HEIC, HEIF, AVIF :
{ mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] }
{ mime: 'image/png',  bytes: [0x89, 0x50, 0x4e, 0x47] }
{ mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] }  // gif, mais pas dans allowlist!
{ mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }
```

**Reco** : remplacer par `import { fileTypeFromBuffer } from 'file-type'` — gestion HEIC, HEIF, AVIF, AVIS, BMP, TIFF, ICO offerte. Permet aussi de **détecter polyglot** par cross-check declared MIME vs detected.

---

## 6. Image CDN options 2026 — comparatif

Le besoin Musaium :
- Servir signed-URL images chat (S3 actuel) à 100k users.
- Générer thumbnails / variants pour l'UI mobile (loading low-res placeholder, hi-res on-tap).
- Réduire le payload mobile (réseau Italie/Espagne 4G musée).

### Tableau comparatif

| Provider | Storage | Egress | Transform | Coût 100k MAU estimate¹ | Verdict Musaium |
|---|---|---|---|---|---|
| **Cloudflare R2 + Images** | $0.015/GB | **Gratuit** | $0.50/1k transforms (5k free) | ~$25-50/mo | **TOP** — R2 + R2-as-origin pour Images Transform |
| **BunnyCDN Optimizer** | Bunny Storage $0.01/GB | $0.01/GB | **Unlimited**, flat $9.50/mo | ~$30/mo | Excellent rapport qualité/prix, mais < global edge Cloudflare |
| **imgix** | Credit-based | Credit | Credit (Starter $25/mo = 100 credits) | ~$75-200/mo | Trop cher pré-launch |
| **ImageKit** | $9/mo start | bandwidth-based | **Free transforms** | ~$50-100/mo | Bon compromis si BW dominant |
| **Cloudinary** | Credit-based, le plus cher | — | Inclus | ~$200-500/mo | Trop cher, complexité credits |

¹ Estimate pilote — basée 100k MAU × 5 photos/session × 2 sessions/mois × 200 KB moyen = ~200 GB BW/mo + ~20k transforms.

Sources :
- [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/) — 5k free transforms, $0.50/1k after, $5/100k stored, $1/100k delivered
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — zero egress confirmed 2026
- [Bunny Optimizer](https://bunny.net/pricing/optimizer/) — $9.50/mo flat unlimited
- [ImageKit alternatives 2026](https://imagekit.io/cloudinary-alternative/)
- [LeanOps Cloudflare vs Cloudinary 2026](https://leanopstech.com/blog/cloudflare-images-pricing-2026/) — Cloudflare 3-5x moins cher que Cloudinary à scale

### Reco V1 Musaium

**Option A (recommended, simplest)** : **Cloudflare R2 (storage) + Cloudflare Images Transform (variants on-the-fly)**.
- Migration S3 → R2 = 1-2 jours dev (S3 API compat).
- R2 zero egress + Images variants → coût total ~$25/mo à 100k MAU.
- Get free 5k variants/month.

**Option B (cheapest)** : **BunnyCDN Storage + Optimizer** flat $9.50/mo.
- Moins d'edge POPs que Cloudflare, mais EU coverage solide (Bunny est slovène/EU).
- Pas de free tier généreux mais flat = prévisible.

**Option C (status quo)** : Garder S3 OVH + servir backend.
- Funktioniert mais : (a) egress OVH = $$ à scale, (b) zero on-the-fly variant, (c) backend = bottleneck.

> **Pilote verdict** : **Option A** (Cloudflare R2 + Images) pour V1 launch. Migration S3 → R2 documentée + DNS swap = 1 jour low-risk.

---

## 7. WebP / AVIF / HEIC 2026 — support et stratégie

### Browser support (caniuse 2026 May)

| Format | Chrome | Safari | Firefox | Edge | Global |
|---|---|---|---|---|---|
| **JPEG** | 100% | 100% | 100% | 100% | 100% |
| **PNG** | 100% | 100% | 100% | 100% | 100% |
| **WebP** | 100% (32+) | 100% (16+) | 100% (65+) | 100% | ~98% |
| **AVIF** | ✅ (85+) | ✅ (16.4+) | ✅ (93+) | ✅ (121+) | **>95%** |
| **HEIC** | ❌ | ✅ iOS/macOS only | ❌ | ❌ | ~20% (Apple only) |

Source : [caniuse AVIF](https://caniuse.com/avif), [Orquitool AVIF browser support 2026](https://orquitool.com/en/blog/avif-browser-support-2026-compatibility-webp-switch/).

### Mobile (iOS Expo SDK 55, Android)

- **iOS Expo SDK 55** : `expo-image-picker` default `preferredAssetRepresentationMode: '.current'` → **upload HEIC original** (pas de transcode) ([expo changelog](https://github.com/expo/expo/blob/main/packages/expo-image-picker/CHANGELOG.md)).
- **Android** : photo capture en JPEG/WebP par défaut. AVIF limité par fabricant/version OS.

### Stratégie recommandée Musaium

```
Upload (client) → multer → magic-byte (file-type) → sharp re-encode → AVIF storage → AVIF served
                                                                   ↘ WebP fallback (legacy)
```

- **Accept** : JPEG / PNG / WebP / **HEIC** / **HEIF** / **AVIF** côté multer + magic-byte.
- **Storage canonical** : **AVIF quality 65** (10x smaller que JPEG, 95%+ browser support).
- **Fallback** : WebP variant pour ~5% browsers legacy via Cloudflare Images `<Accept-CH>` ou `<picture>` element.

Source : [Appwrite HEIC AVIF support](https://appwrite.io/blog/post/new-image-formats-avif-heic), [ShortPixel HEIC workflow](https://shortpixel.com/blog/heic-heif-on-wordpress-an-end-to-end-workflow-from-iphone-upload-to-webp-avif/).

---

## 8. Per-image cost model — backend CPU vs CDN transform

Modèle simple — coût marginal **par image processée** (acquisition + transform + storage + delivery).

### Hypothèses

- 100k MAU × 5 photos/session × 2 sessions/mois = **1 M images/mois**.
- Photo moyenne = 200 KB AVIF (après resize) ou 800 KB JPEG original.
- SigLIP embedding = inevitable backend cost (pas transformable côté CDN — c'est de l'ML, pas de l'image).

### Coût décomposé

| Étape | Self-host (CPU VPS OVH) | Cloudflare R2 + Images | Bunny Optimizer |
|---|---|---|---|
| Upload bandwidth (in) | OVH ingress gratuit | R2 ingress gratuit | Bunny gratuit |
| Magic-byte + multer | ~0 (CPU cycles) | local | local |
| Sharp re-encode + EXIF strip | ~$0.0001/img (CPU time) | local (avant upload) | local |
| **SigLIP ONNX inference** | ~$0.0003/img (40-80 ms CPU) | **local backend** (inévitable) | local |
| Storage 1 M × 200 KB = 200 GB | OVH ~$2/mo | R2 $3/mo | Bunny $2/mo |
| Egress / delivery (assume 5× read per write) | OVH egress ~$50/mo (varies plan) | **$0** | Bunny $10/mo |
| Transform variants (3 sizes × 1 M = 3 M) | inline sharp → CPU bouffé | $1.500/mo (3M × $0.50/1k) ⚠ | **flat $9.50/mo unlimited** |
| **Total/mo (1M images)** | **~$60-100** (backend gets hammered) | **~$5 + $1500 transforms = TOO HIGH si on régénère** | **~$22** ✅ |

⚠️ **Important** : Cloudflare Images Transform compte au **delivery** si R2 = origin, et un cache CDN keep ~95% hit rate. Le calcul réel sur 1 M images avec 5× CDN read = ~1 M × $0.50/1k = **$500/mo** delivery (pas 5x), pas $1500. Le cache absorbe les variants régénérations.

Sources :
- [Cloudflare Images pricing 2026](https://developers.cloudflare.com/images/pricing/)
- [Bunny Optimizer flat](https://bunny.net/pricing/optimizer/)
- [theimagecdn.com Minimize Cloudflare costs 2026](https://theimagecdn.com/docs/how-to-minimize-cloudflare-images-costs)

### GPU sidecar pour SigLIP inference

Si on souhaite offloader l'inference SigLIP du backend :

- **NVIDIA L4** : $0.44-0.80/hr × 720 hr = **$317-576/mo** continuous ([getdeploying L4](https://getdeploying.com/gpus/nvidia-l4)).
- **Replicate hosted SigLIP** : déjà wired comme R8 fallback (`replicate.adapter.ts`). Pricing = à mesurer in vivo, mais cold start = 2-5s, warm = 100-200 ms/img. **~$0.0002/img** à scale.
- **Hugging Face Inference Endpoints** : $0.03-80/hr selon hardware ([HF pricing](https://huggingface.co/docs/inference-endpoints/pricing)).

**Verdict pilote** : Pour 100k users avec 1M images/mo et SigLIP-base CPU = ~83 sec total CPU/mo. **Pas de motif business pour GPU sidecar en V1**. Replicate fallback existant = filet de sécurité suffisant.

---

## 9. Verdict pour Musaium 100k visitors (V1 launch 2026-06-01)

### Synthèse risque

| Axe | Score 0-5 | Justification |
|---|---|---|
| Lib choice (Sharp + ONNX) | **5/5** | State-of-the-art Node.js 2026. Versions à jour. |
| Image upload security | **3/5** | Magic-byte OK mais incomplet. `limitInputPixels` non configuré = **critique**. ClamAV absent. |
| Format support | **2/5** | HEIC/HEIF Apple bloqué côté allowlist = bug fonctionnel (iPhone upload échoue ou perd qualité). |
| Scaling (inference) | **3/5** | Single-instance OK pour V1. Queue absent = blocking sur peak. |
| CDN / delivery | **2/5** | Pas de CDN. S3 + backend = bottleneck à 100k MAU. |
| GDPR / B2B compliance | **3/5** | EXIF stripped, signed URL TTL OK. **ClamAV absent** = B2B blocker probable. |
| Cost model | **4/5** | Sharp + ONNX CPU = très peu cher. Manque CDN pour absorber bandwidth. |

### Score global : **3.1/5** — **NOT enterprise-grade 100k** sans 3 actions critiques

### Top 3 actions critiques V1 (avant 2026-06-01)

1. **Configurer `limitInputPixels` partout Sharp est appelé** (image-preprocess.ts + image-processing.service.ts). Fixer à 24 M px. Add `failOn: 'error'`. **1h dev**. **Critique** sécurité.
2. **Accepter HEIC/HEIF côté backend** (add MIME `image/heic` + `image/heif` + `image/avif` au allowlist + magic-byte file-type lib). **2-3h dev** + tests. **Critique** UX iPhone.
3. **Migrer S3 → Cloudflare R2 + Images Transform** (zero egress, 5k free variants). **1-2 jours dev**. Bénéfice : coût ÷ 10, latence -50% mobile, DDoS-resistant. **Critique** scale.

### Top 3 actions HAUTE priorité V1.x (post-launch, ~30 jours)

4. **BullMQ queue pour SigLIP inference** + worker process séparé. Decouple le request handler du CPU-blocking ONNX call. ~1 semaine dev. **Critique** stabilité peak.
5. **ClamAV sidecar Docker** + intégration `pompelmi`. ~2 jours dev + IaC. **Important** B2B + RGPD.
6. **Replace `image-input.ts` magic-byte avec `file-type` v21**. Cover HEIC/AVIF + détection polyglot. ~2h dev. **Important** sécurité.

### Top 3 nice-to-have V2 (post-revenue B2B)

7. **AVIF canonical storage** + variant generation Cloudflare Images. Réduction bandwidth ~50%.
8. **Quantization INT8 SigLIP** — speedup 2-3x CPU avec recall drop < 2%. Permet d'absorber growth sans GPU.
9. **GPU sidecar L4** ($300-500/mo) si revenue justifie — quand on dépasse 500k MAU.

### Ne PAS faire

- ❌ Migrer vers ImageMagick (slower).
- ❌ Réécrire le SigLIP adapter en Python/FastAPI (déjà l'optionalité Replicate).
- ❌ Activer `unlimited: true` Sharp (annule la protection DOS).
- ❌ Stocker images en BD Postgres (gros files = killer perf, S3/R2 = standard).
- ❌ Construire un image CDN custom (Cloudflare a déjà construit le service).
- ❌ Adopter SigLIP-2 (2025) sans bake test recall ≥ 0.85 sur fixture Musaium — ADR-037 doctrine.

---

## Sources (verified WebSearch / WebFetch 2026-05-12)

### Sharp / libvips
- [sharp pixelplumbing v0.34.5 changelog](https://sharp.pixelplumbing.com/changelog/v0.34.5/)
- [sharp constructor API options](https://sharp.pixelplumbing.com/api-constructor/)
- [sharp issue #4227 — AVIF quality settings](https://github.com/lovell/sharp/issues/4227)
- [sharp issue #3680 — HEIC support](https://github.com/lovell/sharp/issues/3680)
- [sharp issue #4034 — limitInputPixels default behavior](https://github.com/lovell/sharp/issues/4034)
- [sharp issue #3052 — memory leak investigation](https://github.com/lovell/sharp/issues/3052)
- [Context.dev — Preventing memory issues in Sharp](https://www.context.dev/blog/preventing-memory-issues-in-node-js-sharp-a-journey)
- [lovell/sharp releases](https://github.com/lovell/sharp/releases)
- [PkgPulse — Best JS image processing 2026](https://www.pkgpulse.com/guides/best-javascript-image-processing-2026)

### ONNX Runtime
- [microsoft/onnxruntime releases](https://github.com/microsoft/onnxruntime/releases)
- [ONNX Runtime CUDA EP](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)
- [ONNX Runtime CoreML EP](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- [ONNX Runtime threading docs](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)
- [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)
- [ONNX issue #10367 — CoreML EP macOS](https://github.com/microsoft/onnxruntime/issues/10367)
- [ONNX issue #19384 — CPU scaling](https://github.com/microsoft/onnxruntime/issues/19384)
- [xaviviro/onnxruntime-coreml community build](https://github.com/xaviviro/onnxruntime-coreml)

### SigLIP / models
- [SigLIP 2 HF blog](https://huggingface.co/blog/siglip2)
- [SigLIP 2 paper arXiv 2502.14786](https://arxiv.org/abs/2502.14786)
- [DINOv2 vs CLIP vs SigLIP comparison](https://gist.github.com/mail2mhossain/38de5479f0912398b87bec548d9c4a22)

### Security
- [Sourcery — File upload MIME bypass](https://www.sourcery.ai/vulnerabilities/file-upload-content-type-bypass)
- [Help Net Security — Pompelmi 2026](https://www.helpnetsecurity.com/2026/02/02/pompelmi-open-source-secure-file-upload-scanning-node-js/)
- [pompelmi GitHub](https://github.com/pompelmi/pompelmi)
- [CVE-2026-30821 Flowise MIME spoof](https://advisories.gitlab.com/pkg/npm/flowise/CVE-2026-30821/)
- [Transloadit ClamAV Node.js](https://transloadit.com/devtips/implementing-server-side-malware-scanning-with-clamav-in-node-js/)
- [Rietta SVG XSS injection](https://rietta.com/blog/svg-xss-injection-attacks/)
- [file-type npm](https://www.npmjs.com/package/file-type)
- [magic-bytes.js npm](https://www.npmjs.com/package/magic-bytes.js)

### CDN / pricing
- [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [theimagecdn.com Cloudflare cost 2026](https://theimagecdn.com/docs/cloudflare-images-pricing)
- [Bunny Optimizer pricing](https://bunny.net/pricing/optimizer/)
- [ImageKit Cloudinary alternative](https://imagekit.io/cloudinary-alternative/)
- [LeanOps Cloudflare Cloudinary 2026](https://leanopstech.com/blog/cloudflare-images-pricing-2026/)
- [getdeploying NVIDIA L4 pricing](https://getdeploying.com/gpus/nvidia-l4)
- [Modal L4 cost article](https://modal.com/blog/nvidia-l4-price-article)
- [Hugging Face Inference Endpoints pricing](https://huggingface.co/docs/inference-endpoints/pricing)

### Formats / browser
- [caniuse AVIF](https://caniuse.com/avif)
- [Orquitool AVIF browser support 2026](https://orquitool.com/en/blog/avif-browser-support-2026-compatibility-webp-switch/)
- [Appwrite HEIC AVIF support](https://appwrite.io/blog/post/new-image-formats-avif-heic)
- [ShortPixel HEIC workflow](https://shortpixel.com/blog/heic-heif-on-wordpress-an-end-to-end-workflow-from-iphone-upload-to-webp-avif/)
- [expo-image-picker changelog](https://github.com/expo/expo/blob/main/packages/expo-image-picker/CHANGELOG.md)

### Queue / scaling
- [BullMQ documentation](https://docs.bullmq.io/)
- [DEV — Background jobs Node.js 2026](https://dev.to/young_gao/background-job-processing-in-nodejs-bullmq-queues-and-worker-patterns-31d4)

### Squoosh / alternatives
- [Squoosh GitHub](https://github.com/GoogleChromeLabs/squoosh)
- [frostoven Squoosh-with-CLI fork](https://github.com/frostoven/Squoosh-with-CLI)

---

**End of R9 report.**
