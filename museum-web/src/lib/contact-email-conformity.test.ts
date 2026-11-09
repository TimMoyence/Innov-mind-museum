import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { getPrivacyContent } from './privacy-content';

const OLD = 'tim.moyence@gmail.com';
const NEW = 'contact@musaium.com';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const COOKIES_PAGE = path.join(REPO_ROOT, 'museum-web/src/app/[locale]/cookies/page.tsx');

function paragraphsFor(locale: 'en' | 'fr', id: string): string[] {
  const content = getPrivacyContent(locale);
  const section = content.sections.find((s) => s.id === id);
  if (!section) throw new Error(`section ${id} (${locale}) not found`);
  return section.paragraphs;
}

describe('UC-A09 — web privacy content (via getPrivacyContent) email paragraphs', () => {
  it('UC-A09 (happy): EN+FR controller/rights/minors contain NEW, never OLD', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const id of ['controller', 'rights', 'minors']) {
        const joined = paragraphsFor(locale, id).join('\n');
        expect(joined).toContain(NEW);
        expect(joined).not.toContain(OLD);
      }
    }
  });

  it('UC-A02/A05 (happy): controller Contact line is byte-exact NEW per locale', () => {
    expect(paragraphsFor('en', 'controller')).toContain(`Contact: ${NEW}.`);
    expect(paragraphsFor('fr', 'controller')).toContain(`Contact : ${NEW}.`);
  });
});

describe('UC-A24 / UC-A25 — cookies page contactNote (EN + FR)', () => {
  const src = readFileSync(COOKIES_PAGE, 'utf8');

  it('UC-A24 (happy, EN): cookies contactNote has NEW, not OLD', () => {
    expect(src).toContain(
      `Questions about cookies? Contact ${NEW}. We will respond within 30 days.`,
    );
    expect(src).not.toContain(OLD);
  });

  it('UC-A25 (happy, FR/NFR-1): cookies contactNote has NEW, not OLD', () => {
    expect(src).toContain(
      `Questions sur les cookies ? Contactez ${NEW}. Nous répondons sous 30 jours.`,
    );
    expect(src).not.toContain(OLD);
  });
});
