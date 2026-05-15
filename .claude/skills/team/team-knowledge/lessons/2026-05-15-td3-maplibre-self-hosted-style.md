---
runId: 2026-05-15-td3-maplibre-self-hosted-style
mode: feature
pipeline: enterprise
completedAt: 2026-05-15T19:00:00Z
durationMs: 1800000
correctiveLoops: 0
costUSD: 5.01
tags:
  - feature
  - enterprise
  - td-3
  - verbatim
  - tech
---

# Lesson — 2026-05-15-td3-maplibre-self-hosted-style

## Trigger

- input: TD-3 verbatim (TECH_DEBT.md lines 78-104), `mapStyleUrl.ts:11`, `mapLibreStyle.ts:20`, `offlinePackManager.ts:114`, `useOfflinePacks.ts:74`, `useGeofencePreCache.ts:55`, `.github/workflows/deploy-privacy-policy.yml`.
- output: spec.md.
- shape of `buildOsmRasterStyle`: v8 raster style, one `osm-raster` source pointing at `{a,b,c,d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`, tileSize 256, minzoom 0, maxzoom 19, OSM+CARTO attribution, glyphs `demotiles.maplibre.org/font`, one layer `osm-raster-layer` of `type: raster`. Source of truth for the offline mirror.
- `OFFLINE_STYLE_URL` consumers grep'd : 2 (useOfflinePacks.ts:74, useGeofencePreCache.ts:55), both transparently forward to `OfflineManager.createPack({ mapStyle: ... })`. Constant swap propagates everywhere.
- hosting options compared : A GH Pages (retained, re-uses privacy-policy deploy), B bundle + local HTTP (rejected, RN brittle), C CartoDB direct (rejected — `curl` confirms official style is `type: vector`, online is raster, would not fix mismatch), D inline + workaround (rejected, OfflineManager requires URL), E S3/CloudFront (rejected, violates `project_no_staging_v1`).
- decision : Option A. Target URL `https://timmoyence.github.io/Innov-mind-museum/maplibre/cartodb-raster-style.json`. Light-only for V1.
- open questions handed to user : none blocking. Q1 (Dark Matter mirror) deferred — telemetry-driven follow-up. Q2 (URL version pin) deferred — initial mirror is stable.

## What worked

- gates run: lint, tsc, tests, gitnexus_detect_changes
- verdict: PASS / WARN / FAIL
- failures: ...
- corrective loops used: 0 / 1 / 2 (cap)

## What failed

- spec ↔ implementation alignment: ...
- KISS / DRY / hexagonal compliance: ...
- verdict: PASS / WARN / FAIL
- comments: ...

## Surprises

- input: tasks.md (T1.1 → T5.1), handoffs/001-architect-to-editor.json.
- T1.1 DONE — `docs/maplibre/cartodb-raster-style.json` created (861 bytes, jq parses OK, single raster source `osm-raster`, 4 CartoDB light_all subdomains, tileSize 256, minzoom 0, maxzoom 19, OSM+CARTO attribution, glyphs demotiles font, single `osm-raster-layer` raster layer — exact structural mirror of `buildOsmRasterStyle(false)`).
- T1.2 DONE — `.gitignore` whitelist `!docs/maplibre/` + `!docs/maplibre/**` inserted after the `!docs/RUNBOOKS/**` entry. `git status` confirms `docs/maplibre/cartodb-raster-style.json` is git-visible (untracked → staged).
- T1.3 DONE — `.github/workflows/deploy-privacy-policy.yml` extended : `on.push.paths` adds `'docs/maplibre/**'` ; the `Prepare pages artifact` step now `mkdir -p _site/maplibre` and `cp docs/maplibre/cartodb-raster-style.json _site/maplibre/cartodb-raster-style.json`. SHA-pinned actions (`@de0fac2e`, `@fc324d35`, `@cd2ce8fc`) left untouched. Workflow name unchanged (deferred per tasks.md optional edit 3).
- T2.1 DONE — `museum-frontend/features/museum/infrastructure/mapStyleUrl.ts` rewritten. Stale "follow-up ticket will replace this" comment SUPPRIMÉ (memory `feedback_bury_dead_code` — follow-up = TD-3 = this commit). New JSDoc references the mirror + Pages workflow + drift test. New value : `https://timmoyence.github.io/Innov-mind-museum/maplibre/cartodb-raster-style.json`. Grep confirms 2 consumers (`useOfflinePacks.ts:74`, `useGeofencePreCache.ts:55`) — both transparently use the new URL.
- T3.1 DONE — `museum-frontend/__tests__/features/museum/mapStyleUrl.test.ts` created. 6 assertions split across 2 describe blocks (1 URL shape : HTTPS, `.github.io`, ends `/cartodb-raster-style.json` ; 5 drift guards : version, first tile URL, tileSize/minzoom/maxzoom/attribution, layer count + layer 0 type/source, full subdomain order). PostToolUse prettier formatted the file (type → interface, single-line tile URL) — logic preserved.
- T4.1 DONE — `.github/workflows/ci-cd-mobile.yml` quality job has a new `Validate offline map style JSON (TD-3 drift guard)` step before Expo Doctor, with `working-directory: ${{ github.workspace }}` override (job default is `museum-frontend`) running `node -e "JSON.parse(...)"` against `docs/maplibre/cartodb-raster-style.json`.
- T5.1 DONE — `docs/TECH_DEBT.md` TD-3 ticked `[x]` with closure note (mirror path + URL + drift test + CI guard + Option A rationale). Other TD ticks NOT touched.
- gates that passed inline (post-edit hooks) : `post-edit-lint: PASS`, `post-edit-typecheck: PASS`.
- tests verbatim : `npx jest --testPathPattern="mapStyleUrl"` →
  ```
  PASS __tests__/features/museum/mapStyleUrl.test.ts
    OFFLINE_STYLE_URL — self-hosted CartoDB raster mirror (TD-3)
      ✓ is an HTTPS URL hosted on GitHub Pages and pointing at cartodb-raster-style.json
    docs/maplibre/cartodb-raster-style.json — drift guard against buildOsmRasterStyle(false)
      ✓ matches the StyleSpecification version
      ✓ matches the first raster tile URL pattern (light_all subdomain a)
      ✓ matches tileSize, minzoom, maxzoom, attribution
      ✓ matches layer count and layer 0 type/source
      ✓ mirrors all four CartoDB subdomains (a, b, c, d) in order
  Tests: 6 passed, 6 total
  ```
- staged TD-3 files (7) : `docs/maplibre/cartodb-raster-style.json`, `.gitignore`, `.github/workflows/deploy-privacy-policy.yml`, `.github/workflows/ci-cd-mobile.yml`, `museum-frontend/features/museum/infrastructure/mapStyleUrl.ts`, `museum-frontend/__tests__/features/museum/mapStyleUrl.test.ts`, `docs/TECH_DEBT.md`.
- forbidden files untouched (verified) : Stryker WIP, `museum-backend/src/modules/auth/**` (pre-staged by TD-2), `museum-frontend/shared/infrastructure/bootstrapProfile.ts` (pre-staged by TD-2).
- corrective loops used : 0/2.
- verdict : TD3-DONE-STAGED.

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
