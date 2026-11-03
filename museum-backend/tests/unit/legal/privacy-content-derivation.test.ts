import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const read = (relative: string): string => readFileSync(join(REPO, relative), 'utf8');

const SOURCE_PRIVACY = 'museum-backend/src/shared/legal/privacy-content.canonical.json';
const SOURCE_TERMS = 'museum-backend/src/shared/legal/terms-content.canonical.json';
const WEB_PRIVACY = 'museum-web/src/lib/legal/privacy-content.canonical.json';
const WEB_TERMS = 'museum-web/src/lib/legal/terms-content.canonical.json';
const WEB_PRIVACY_MODULE = 'museum-web/src/lib/privacy-content.ts';
const MOBILE_PRIVACY = 'museum-frontend/features/legal/privacyPolicyContent.ts';
const CODEGEN = 'museum-frontend/scripts/codegen-legal-content.mjs';

const RETIRED_SUBPROCESSORS = /Langfuse|LLM.?Guard|Presidio|Grafana|Prometheus|PgBouncer/i;

describe('RAZ-M12b', () => {
  it('RAZ-M12b · la copie web de la politique et des CGU est identique à la source backend', () => {
    expect(read(WEB_PRIVACY)).toBe(read(SOURCE_PRIVACY));
    expect(read(WEB_TERMS)).toBe(read(SOURCE_TERMS));
  });

  it('RAZ-M12b · le texte mobile est exactement celui que génère la source', () => {
    expect(() =>
      execFileSync(process.execPath, [join(REPO, CODEGEN), '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('RAZ-M12b · aucune surface de la politique ne cite un sous-traitant retiré', () => {
    const surfaces = [SOURCE_PRIVACY, WEB_PRIVACY, WEB_PRIVACY_MODULE, MOBILE_PRIVACY];
    const citing = surfaces.filter((surface) => RETIRED_SUBPROCESSORS.test(read(surface)));

    expect(read(SOURCE_PRIVACY)).toContain('OpenAI');
    expect(citing).toEqual([]);
  });
});
