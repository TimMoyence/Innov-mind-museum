# ADR-062 — Single canonical source for legal content (privacy + terms + subprocessors) with CI drift sentinel

**Status:** Accepted
**Date:** 2026-05-22
**Run:** `2026-05-21-p0-gdpr` (P0 GDPR residual lot — items B15, B16, B18)

---

## Context

Musaium ships three public-facing surfaces that render legal content (GDPR Art. 13(1)(e) recipient disclosure, terms of service, cookie/ePrivacy notice) :

- `docs/privacy-policy.html` — static HTML, served at `https://musaium.com/privacy-policy` via `deploy-privacy-policy.yml`.
- `museum-web/src/app/[locale]/{privacy,terms,subprocessors,cookies}/` — Next.js App Router routes.
- `museum-frontend/features/legal/{privacyPolicyContent,termsOfServiceContent}.ts` — React Native screen content.

Pre-P0 audit (May 2026) found these three surfaces had drifted in three independent ways :

1. **Versioning drift.** HTML + FE had `lastUpdated` 2026-03-18 (12 sections); web had `lastUpdated` 2026-05-17 (14 sections incl. AI Act).
2. **Subprocessor list drift.** Audit identified 19 actual recipient categories (B15) ; HTML listed only 6 ; FE listed 6 ; web listed ~13 with DeepSeek omitted.
3. **Legal-content drift (CNIL Délibération 2021-018 / R13).** HTML referenced minor age "16 ans" ; spec mandates 15 (CNIL DDM française 2021-018). FE inherited the same incorrect value.

Beyond the immediate fix in the P0 run, the structural risk is recurrence : three surfaces, three editors, three review pathways, no single mechanism preventing the next drift. GDPR Art. 13(1)(e) compliance is fragile when the public-facing claim depends on whichever surface the regulator/user reads first.

The user decision recorded in `team-state/2026-05-21-p0-gdpr/user-decisions.md` § B16 locks the resolution : "the web 14-section version is the canonical content. HTML and FE must derive from it (single source). A CI drift sentinel must fail if any surface's version/content diverges from the canonical."

## Decision

Adopt a **single canonical source** for legal content, owned by `museum-backend/`, with derivation/codegen producing the three surface artefacts, and a CI sentinel enforcing structural alignment.

### Canonical source layout

```
museum-backend/src/shared/legal/
  ├── privacy-content.canonical.json   # 14 sections × EN+FR × 19 subprocessors
  ├── terms-content.canonical.json     # terms of service, EN+FR
  ├── index.ts                         # typed loader + re-export
  └── policy-version.ts                # version + lastUpdated (pre-existing, kept)
```

Section IDs, subprocessor names + roles, locale keys, `version`, and `lastUpdated` are the binding fields the sentinel watches. Wording-level diffs inside section bodies are also covered (vendor mentions are detected by a comment-stripped grep, see Drift sentinel below).

### Derivation per surface

- **`museum-web`** : direct import of the canonical JSON via `src/lib/privacy-content.ts` (thin re-export, no transformation). The `/privacy`, `/terms`, `/subprocessors`, `/cookies` routes are Server Components reading the canonical JSON at render time.
- **`museum-frontend`** : codegen script `museum-frontend/scripts/codegen-legal-content.mjs` reads the canonical JSON and emits `features/legal/privacyPolicyContent.ts` + `termsOfServiceContent.ts` as typed TS exports. Run by a `pnpm legal:codegen` command and by a husky pre-commit hook when the canonical JSON is staged.
- **`docs/privacy-policy.html`** : maintained manually for V1 (legacy hand-written HTML retained) and verified by the drift sentinel. (Reviewer NIT 5–8 deferred a fully automated HTML rebuild from the canonical to V1.1 ; see "Follow-ups" below.)

### Drift sentinel

`museum-backend/scripts/sentinels/privacy-content-drift.mjs` runs in CI and locally. For each surface it :

1. Loads the canonical JSON (source of truth).
2. Loads the surface artefact (FE TS, web JSON re-export, HTML).
3. Strips comments (`stripComments()` pre-pass — JSDoc `/** ... */`, line `//`, block `/* */`) before substring-matching vendor mentions so a vendor referenced ONLY in a comment cannot pass the sentinel by alias. This pre-pass was added in Reviewer v2 IMPORTANT-4 fix.
4. Verifies : `version` equality, `lastUpdated` equality, every canonical section ID present in the surface, every canonical subprocessor name present in the rendered body.
5. Exits non-zero (CI fail) if any surface diverges. Four negative test cases protect the sentinel itself (`tests/unit/scripts/privacy-content-drift.test.ts`), including the "vendor mentioned only in comment" regression.

A second sentinel `museum-backend/scripts/sentinels/web-cookies-audit.mjs` scans `museum-web/` for forbidden tracking SDK identifiers (GA, Hotjar, Mixpanel, Segment, FB pixel, etc.) to preserve the ePrivacy "no banner, notice-only" stance committed in B18. CI surface : `ci-cd-web.yml` quality gate (reviewer IMPORTANT-3 fix moved it from `ci-cd-backend.yml`).

## Consequences

### Positive

- **Single point of truth for GDPR Art. 13(1)(e).** Updating subprocessors / minor age / section content happens in one JSON ; the FE codegen + web import + CI sentinel propagate (or fail loudly).
- **Drift cannot ship.** A PR diverging the FE TS from the canonical without regenerating, or omitting a vendor from the HTML, fails the sentinel before merge.
- **Audit ergonomics.** A regulator request "show me your recipients list" resolves to one file (the canonical JSON) instead of three potentially divergent surfaces.
- **Locale parity.** EN + FR live side-by-side in the canonical JSON ; codegen + sentinel enforce both. Adding a third locale is a single JSON field add.

### Negative / Trade-offs

- **Tooling surface.** Three new files (canonical JSON × 2 + codegen script) + two sentinels + a husky hook trigger. The maintenance cost is concentrated in `museum-backend/scripts/sentinels/` and `museum-frontend/scripts/codegen-legal-content.mjs`.
- **HTML is hand-maintained, not codegen'd.** For V1, `docs/privacy-policy.html` is the original hand-written file with corrections applied manually; the sentinel verifies alignment but does not regenerate. The originally-planned `build-privacy-html.mjs` codegen was deferred (see Follow-ups). Risk : a manual HTML edit could pass the structural sentinel but diverge in wording — the comment-stripped substring grep catches vendor list / age / version drift, but not free-text rewordings of policy paragraphs.
- **Husky hook adds ~100–200 ms to commits touching the canonical JSON.** Acceptable given the alternative (drift in production).
- **Cross-app import path** (`museum-frontend` reading `museum-backend/src/shared/legal/`) is unusual : it crosses app boundaries. Justified because legal content is a corporate artefact, not app-owned business logic. Tracked as a follow-up to potentially move to `packages/musaium-shared/legal/` if a third surface ever needs it.

### Ops checklist

- Update legal content → edit the JSON in `museum-backend/src/shared/legal/` → `pnpm legal:codegen` (FE) → re-verify HTML manually → commit (sentinel runs in pre-push + CI).
- Adding/removing a subprocessor → update `recipients[]` in canonical JSON → codegen → manual HTML sync → sentinel passes.
- Bumping `lastUpdated` → edit canonical JSON → bumps everywhere via codegen + sentinel.
- The `policy-version.ts` constant stays as the runtime version reference for FE consent UI ; the canonical JSON `version` field must match it (sentinel verifies).

## Alternatives considered

- **(a) Independent surfaces, periodic manual audit.** Rejected : status quo. The May 2026 audit demonstrated that the periodic-manual-audit model fails — drift had accumulated for two months between HTML/FE and web.
- **(b) FE as canonical, web + HTML derive.** Rejected : FE TS module is harder to read/generate from (typed exports, locale objects), and the user-locked decision explicitly named the web 14-section content as the authoritative version (it incorporates AI Act references that the FE/HTML version lacked).
- **(c) Web (Next.js) as canonical via API endpoint, mobile + HTML fetch at build time.** Rejected : adds a runtime dependency for a build-time artefact, complicates offline mobile (FE bundles legal content into the binary for App Store reviewer offline viewing), and the JSON-in-repo approach gives free git history + PR review of changes.
- **(d) Shared package `@musaium/legal` (npm workspace).** Rejected for V1 : `@musaium/shared` is a `file:` package (see CLAUDE.md gotcha), introducing a second one for legal content adds workspace-linking complexity for one consumer (FE). Codegen + direct import is simpler. Revisitable in V2 if `packages/musaium-shared/legal/` proves cleaner.

## Follow-ups

- **HTML codegen (NIT, V1.1)** : implement `museum-backend/scripts/codegen/build-privacy-html.mjs` to fully regenerate `docs/privacy-policy.html` from the canonical JSON, removing the "manually maintained + verified" gap. Tracked in `docs/TECH_DEBT.md` as `TD-LEGAL-HTML-CODEGEN-01`.
- **Footer DRY (Reviewer NIT 5)** : the three new footer links (`/terms`, `/subprocessors`, `/cookies`) duplicate the existing privacy link pattern in `museum-web/src/components/shared/Footer.tsx` ; a `legalLinks` array + map is a follow-up cleanup.
- **Cross-app import path (Reviewer NIT 6)** : if a fourth consumer appears, promote canonical JSON to `packages/musaium-shared/legal/`.

## References

- Verification evidence : `team-state/2026-05-21-p0-gdpr/verification/V2-privacy-policy.md` (3-way drift catalogue).
- User decision : `team-state/2026-05-21-p0-gdpr/user-decisions.md` § B16, § B18.
- Spec : `team-state/2026-05-21-p0-gdpr/spec.md` R11–R18 (legal content acceptance criteria).
- Design : `team-state/2026-05-21-p0-gdpr/design.md` D5/D7 (canonical layout + codegen triggers).
- Reviewer findings (v1 + v2) : `team-reports/2026-05-21-p0-gdpr/code-review.json` (BLOCKER 1 alias-to-dodge, IMPORTANT 3 sentinel wiring, IMPORTANT 4 strip-comments).
- Code touchpoints : `museum-backend/src/shared/legal/privacy-content.canonical.json`, `museum-backend/src/shared/legal/terms-content.canonical.json`, `museum-backend/src/shared/legal/index.ts`, `museum-backend/scripts/sentinels/privacy-content-drift.mjs`, `museum-backend/scripts/sentinels/web-cookies-audit.mjs`, `museum-frontend/scripts/codegen-legal-content.mjs`, `museum-web/src/app/[locale]/{terms,subprocessors,cookies}/page.tsx`.
- Related : ADR-053 (Apple 5.1.2(i) granular consent — drives the subprocessor recipient list shape).
