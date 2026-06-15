/**
 * @jest-environment ./tests/helpers/integration/onnx-node-environment.cjs
 *
 * T7.4 — Recall@5 crop-robustness evaluation (integration, real ONNX model).
 *
 * Runs under a custom jest environment that restores host-realm typed-array
 * globals (`Float32Array`, …) so the REAL `onnxruntime-node` native binding
 * accepts the tensors created in-test. Jest's default `node` sandbox gives each
 * file distinct typed-array constructors, which the native addon rejects at
 * `session.run` ("data must be type of Float32Array") even though the same code
 * works in plain Node — a jest↔native-addon realm mismatch, not an adapter bug.
 * See `tests/helpers/integration/onnx-node-environment.cjs`.
 *
 * NFR (spec.md §5): recall@5 ≥ 0.85 on (image, expected_qid) pairs. This suite
 * exercises the END-TO-END visual-similarity stack against the REAL SigLIP ONNX
 * encoder (`SiglipOnnxAdapter` → `models/siglip2-base-patch16-224.onnx`,
 * `pooler_output`, L2-normalised) and the REAL `ArtworkEmbeddingRepositoryPg`
 * over a live pgvector `halfvec(768)` HNSW index via `createIntegrationHarness`.
 * No mock encoder, no in-memory repo — integration tier per ADR-012.
 *
 * ── Why this is a REAL recall test, not a round-trip ────────────────────────
 * The previous version encoded the input image, stored THAT exact vector as the
 * catalog row, then queried with the SAME vector — a trivial cosine-1.0 self
 * match that proved nothing about retrieval. This rewrite instead:
 *   • stores  enc(FULL public-domain image)               as the catalog row, and
 *   • queries enc(center-crop of the SAME image)          as the user photo,
 * so the query buffer feeds DIFFERENT pixels through the same
 * `resize(224,224,fit:'fill')` preprocess → the query vector is NEVER
 * byte-identical to its stored vector. The crop self-cosine is strictly < 1.0,
 * and we ASSERT it (max query self-cos < 0.999) to prove the self-match is gone.
 *
 * ── Measured, not asserted-blind (UFR-013) ─────────────────────────────────
 * Running the real model on the 4 committed public-domain fixtures, encoding
 * each FULL and querying with a fixed center crop (frac = {@link CROP_FRACTION})
 * against the other 3 catalog artworks (hardest realistic distractors, measured
 * cross-artwork cosine 0.480–0.693) plus {@link NUM_DISTRACTORS} seeded random
 * distractors:
 *   recall@1 = recall@5 = 1.00 at every crop fraction 0.3–0.9.
 *   crop-vs-full self-cosine = 0.585–0.991 (< 1.0 everywhere → no self-match;
 *   > the hardest distractor 0.693 at every frac ≥ 0.4 → real recall).
 * The asserted floor {@link RECALL_FLOOR} = 0.85 carries a 0.15 margin on this
 * set. We do NOT assert recall == 1.0 (brittle to one fixture/model swap). The
 * full 50-pair held-out benchmark is a tracked ops item (recall-eval.json
 * `_meta.opsBacklog`), not claimed shipped.
 *
 * ── Gating (honest skip) ───────────────────────────────────────────────────
 * The ONLY honest skip is model ABSENCE: a fresh clone without
 * `scripts/pull-siglip-model.sh` having run has no ONNX file, so the suite
 * `describe.skip`s. Once the model is present the suite MUST run; a MISSING
 * fixture image then FAILS LOUD (throws) rather than skipping — per UFR-013 we
 * never fabricate a green when an input is absent.
 *
 * ── CI lane (where this actually runs) ──────────────────────────────────────
 * Wired in `.github/workflows/recall-e2e.yml`: a NIGHTLY cron (04:40 UTC) +
 * push-to-main (on encoder/repo/fixture/test paths) + workflow_dispatch lane
 * that pulls the real model from the pinned GHCR base image
 * (`scripts/pull-siglip-model.sh`) and runs this suite with
 * `RUN_INTEGRATION=true`. It is NON-blocking (deliberately NOT a
 * branch-protection required check — recall is a quality signal, not a release
 * gate) but REPORTED: a red unattended run opens/closes a tracking GitHub issue
 * (label `nightly-recall-alert`, `recall-alert` job) so a recall regression
 * surfaces, mirroring `ci-cd-mobile.yml`'s `maestro-full-alert`. Before this
 * lane existed the suite had ZERO workflow references and was a permanent silent
 * skip. The full 50-pair held-out benchmark remains a tracked ops item
 * (recall-eval.json `_meta.opsBacklog`), not claimed shipped.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import {
  EMBEDDING_DIM,
  makeCenterCroppedQueryBuffer,
  makeNormalisedFloat32,
} from '../../../helpers/chat/visual-similarity/embedding.fixtures';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

interface RecallPair {
  inputImagePath: string;
  expectedQid: string;
  title: string;
  museumQid: string;
}

interface RecallFixture {
  _meta: {
    currentSize: number;
    modelVersion: string;
  };
  pairs: RecallPair[];
}

const ONNX_MODEL_PATH =
  process.env.SIGLIP_ONNX_MODEL_PATH ?? './models/siglip2-base-patch16-224.onnx';
const MODEL_AVAILABLE = existsSync(resolve(ONNX_MODEL_PATH));
const FIXTURE_PATH = resolve(__dirname, '../../../fixtures/recall-eval.json');
// __dirname = tests/integration/chat/visual-similarity → 4 levels up = backend
// root, which is what the fixture's `inputImagePath` (tests/fixtures/...) is
// relative to.
const REPO_ROOT = resolve(__dirname, '../../../..');

// Honest gate: the suite skips ONLY when the ONNX model file is absent (fresh
// clone, no `pull-siglip-model.sh`). A missing FIXTURE image is NOT a skip — it
// throws inside the test (see below) so an incomplete fixture can't masquerade
// as a pass. The fixture JSON itself is committed and always present.
const describeFn = MODEL_AVAILABLE ? describe : describe.skip;

/** Asserted floor — 0.85 with a measured 0.15 margin (recall@5 = 1.00 on this set). */
const RECALL_FLOOR = 0.85;
const TOP_K = 5;
const NUM_DISTRACTORS = 1_000;
/**
 * Fixed center-crop fraction for the query. 0.5 (central 50%) is well clear of
 * 1.0 (measured self-cos 0.891–0.928 → proves no self-match) yet far above the
 * hardest cross-artwork distractor (0.693) → recall@5 = 1.00. Deterministic.
 */
const CROP_FRACTION = 0.5;
/** Self-match guard: a query vector identical to its stored vector would cos==1.0. */
const SELF_MATCH_CEILING = 0.999;

const cosine = (a: Float32Array, b: Float32Array): number => {
  // Both vectors are L2-normalised by the encoder, so dot product == cosine.
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dot;
};

describeFn('recall@5 (T7.4 — crop-robustness, real ONNX model + pgvector)', () => {
  // The beforeAll boots a Postgres testcontainer + runs migrations + builds the
  // ONNX encoder; on a cold CI runner that exceeds Jest's default 5s hook
  // timeout (which fails the hook AND leaves `encoder` undefined → the afterAll
  // shutdown crashes). Match the sibling integration suites' generous budget.
  jest.setTimeout(180_000);

  let harness: Awaited<ReturnType<typeof createIntegrationHarness>>;
  let repo: ArtworkEmbeddingRepository;
  let encoder: EmbeddingsPort;
  let fixture: RecallFixture;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();

    const { ArtworkEmbeddingRepositoryPg } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic load so the require resolves only when the gate is open
      require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
        ArtworkEmbeddingRepositoryPg: new (
          ds: import('typeorm').DataSource,
        ) => ArtworkEmbeddingRepository;
      };
    repo = new ArtworkEmbeddingRepositoryPg(harness.dataSource);

    const { SiglipOnnxAdapter } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic load to defer the ONNX runtime cost behind the gate
      require('@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter') as {
        SiglipOnnxAdapter: new (args: { modelPath: string; timeoutMs: number }) => EmbeddingsPort;
      };
    encoder = new SiglipOnnxAdapter({
      modelPath: ONNX_MODEL_PATH,
      timeoutMs: 30_000,
    });

    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as RecallFixture;
  });

  afterAll(async () => {
    // Release the native ONNX session so the worker doesn't hang (CLAUDE.md
    // Stryker/open-handle gotcha). Optional + idempotent + fail-open. Guard
    // `encoder` itself: if beforeAll failed/timed out it is undefined, and an
    // unguarded `encoder.shutdown` would throw a second, masking error.
    await encoder?.shutdown?.();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it(`reaches recall@5 ≥ ${String(RECALL_FLOOR)} on cropped queries (no self-match)`, async () => {
    expect(fixture.pairs.length).toBeGreaterThan(0);

    // 1. Build the catalog: each row stores enc(FULL public-domain image). Keep
    //    the full-image vector around so we can prove the cropped query is NOT
    //    a byte-identical self-match.
    const catalogRows: ArtworkEmbeddingRow[] = [];
    const fullVectors = new Map<string, Float32Array>();

    for (const pair of fixture.pairs) {
      const imagePath = resolve(REPO_ROOT, pair.inputImagePath);
      if (!existsSync(imagePath)) {
        // Per UFR-013: never fabricate a pass when an input is missing — fail
        // loudly so the operator knows the fixture is incomplete. This is a
        // THROW, not a skip: once the model is present the suite must run.
        throw new Error(`recall fixture image missing: ${pair.inputImagePath}`);
      }
      const fullBuffer = readFileSync(imagePath);
      const { vector, modelVersion } = await encoder.encode({
        buffer: fullBuffer,
        mimeType: 'image/jpeg',
      });
      fullVectors.set(pair.expectedQid, vector);
      catalogRows.push({
        qid: pair.expectedQid,
        vector,
        metadata: {
          title: pair.title,
          imageUrl: `https://example.org/${pair.expectedQid}.jpg`,
          museumQid: pair.museumQid,
        },
        imageSource: 'wikimedia',
        license: 'public-domain',
        embeddingModelVersion: modelVersion,
      });
    }

    // 2. Dense distractor field: deterministic random vectors so the HNSW index
    //    has to actually discriminate (orthogonal-ish, measured cos ≈ 0.14).
    const distractors: ArtworkEmbeddingRow[] = Array.from({ length: NUM_DISTRACTORS }, (_, i) => ({
      qid: `Q${9_000_000 + i}`,
      vector: makeNormalisedFloat32(i + 100, EMBEDDING_DIM),
      metadata: {
        title: `Distractor ${i}`,
        imageUrl: `https://example.org/distractor-${i}.jpg`,
      },
      imageSource: 'wikimedia',
      license: 'public-domain',
      embeddingModelVersion: fixture._meta.modelVersion,
    }));

    await repo.upsertBatch([...catalogRows, ...distractors]);

    // 3. Query with a CENTER-CROP of each source image (the "user photo"). The
    //    crop vector is distinct from the stored full-image vector — assert
    //    that (no trivial self-match) and tally top-5 hits.
    let hits = 0;
    const selfCosines: number[] = [];

    for (const pair of fixture.pairs) {
      const imagePath = resolve(REPO_ROOT, pair.inputImagePath);
      const fullBuffer = readFileSync(imagePath);
      const cropBuffer = await makeCenterCroppedQueryBuffer(fullBuffer, CROP_FRACTION);
      const { vector: queryVector } = await encoder.encode({
        buffer: cropBuffer,
        mimeType: 'image/jpeg',
      });

      // Prove the query is a DIFFERENT vector than the stored row (cos < 1.0).
      const storedVector = fullVectors.get(pair.expectedQid);
      expect(storedVector).toBeDefined();
      if (storedVector) {
        selfCosines.push(cosine(queryVector, storedVector));
      }

      const nearest = await repo.findNearest(queryVector, TOP_K);
      if (nearest.map((r) => r.qid).includes(pair.expectedQid)) {
        hits += 1;
      }
    }

    // No-self-match invariant: at least one cropped query is strictly below the
    // ceiling (in practice ALL are — measured 0.891–0.928 at frac 0.5). A 1.0
    // here would mean the query reused the stored vector (the old design bug).
    const maxSelfCosine = Math.max(...selfCosines);
    expect(maxSelfCosine).toBeLessThan(SELF_MATCH_CEILING);

    // Real recall: cropped-query retrieval over the dense catalog.
    const recall = hits / fixture.pairs.length;
    expect(recall).toBeGreaterThanOrEqual(RECALL_FLOOR);
  });
});
