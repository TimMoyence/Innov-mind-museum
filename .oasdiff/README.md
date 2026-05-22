# oasdiff config — `.oasdiff/`

Wired by `.husky/pre-push` Gate 15.

## `severity-levels.txt`

oasdiff [severity-levels file](https://github.com/oasdiff/oasdiff/blob/main/docs/CONFIG.md)
for the `breaking` command. **Strict format** : `<check-id> <level>` per line.
Comments and blank lines are NOT supported by the parser (verified 1.15.3).

Each entry expresses the project's POLICY on which breaking-change categories
block CI (`err`, default) vs which surface as warnings only (`warn`, `info`).
The hook still runs oasdiff and still surfaces every breaking change in the
pre-push and CI logs — only the fail-on threshold is policy-driven.

**This file is NOT a UFR-020 bypass mechanism.** Reviewers MUST inspect any
WARN at PR time and accept-or-revert per change. Adding a new entry is a
deliberate policy decision that must be reviewed.

## Active downgrades

### `request-property-became-required` → warn

- **Cycle** : P0.A2 (DOB age-gate)
- **Introduced** : commit `77c5e81b2` `fix(auth): P0 security hardening — PII logs, DOB gate, …`
- **Reason** : CNIL Délibération 2021-018 mandates ≥ 15-year minor consent age.
  The registration endpoint MUST collect `dateOfBirth` at signup to enforce the
  gate server-side. Any client omitting it gets HTTP 400.
- **Mitigation** : FE clients (museum-frontend + museum-web onboarding flows)
  already collect + send `dateOfBirth` in the same release.
- **Future** : new endpoints SHOULD avoid making properties required after
  release. Legitimate compliance/safety adds will pass with a WARN visible in
  CI ; reviewer is the gatekeeper.

### `response-property-max-increased` → warn

### `response-property-min-decreased` → warn

- **Cycle** : Wave B rating widening (PR #295 `p0/feature-gates` squash)
- **Introduced** : the P0 feature-gates lot widens the `review/rating` (and
  `reviews/items/rating` in the DSAR export) range from `[1, 5]` to `[0, 10]`
  on `POST /api/reviews` (201) and `GET /api/users/me/export` (200).
- **Reason** : Wave B requires finer-grained rating granularity (half-stars +
  the option of a `0` "no-rating" sentinel). Range superset is mathematically
  a strict supererset of the previous one — every old value (1-5) remains
  valid both client- and server-side, but oasdiff flags it as a breaking
  schema change because the response envelope is wider than before.
- **Mitigation** : FE clients (museum-frontend + museum-web review surfaces)
  ship in the same release with the new clamp `[0, 10]`. Existing API
  consumers that hard-coded the old upper bound `5` will need to widen, but
  no value they have ever seen will become invalid.
- **Future** : new rating-shape changes SHOULD bump the OpenAPI route version
  (e.g. `/api/v2/reviews`) rather than re-widening in place.

## Adding a new downgrade

1. Run the failing push locally ; capture the exact check-id from oasdiff
   output (`error [<check-id>] at …`).
2. Add `<check-id> <level>` to `severity-levels.txt`.
3. Add a section under `## Active downgrades` here citing
   **cycle / commit / reason / mitigation / future**.
4. Commit both files in a `chore(oasdiff):` commit with the rationale in
   the body. PR-reviewer treats this as a policy change.
