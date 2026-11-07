import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import type { ReactElement } from 'react';

import AccessibilityPage from '../accessibility/page';
import PrivacyPage from '../privacy/page';
import SecurityPage from '../security/page';
import TermsPage from '../terms/page';
import { getAccessibilityContent } from '@/lib/accessibility-content';
import { getPrivacyContent } from '@/lib/privacy-content';
import { getSecurityContent } from '@/lib/security-content';
import termsCanonical from '@/lib/legal/terms-content.canonical.json';

interface Section {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

const PAGES: [
  string,
  (props: { params: Promise<{ locale: string }> }) => Promise<ReactElement>,
  Section[],
][] = [
  ['accessibilité', AccessibilityPage, getAccessibilityContent('fr').sections],
  ['sécurité', SecurityPage, getSecurityContent('fr').sections],
  ['confidentialité', PrivacyPage, getPrivacyContent('fr').sections],
  ['conditions', TermsPage, termsCanonical.locales.fr.sections],
];

describe('pages légales du site', () => {
  it.each(PAGES)(
    'DRY · la page %s montre chaque section avec son ancre, son titre et ses paragraphes',
    async (_name, Page, sections) => {
      const { container } = render(await Page({ params: Promise.resolve({ locale: 'fr' }) }));

      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        const block = container.querySelector<HTMLElement>(`[id="${section.id}"]`);
        expect(block).not.toBeNull();
        const scoped = within(block as HTMLElement);
        expect(scoped.getByRole('heading', { level: 2 }).textContent).toBe(section.title);
        expect(
          scoped.getAllByText((_, node) => node?.tagName === 'P').map((p) => p.textContent),
        ).toEqual([...section.paragraphs]);
      }
    },
  );
});
