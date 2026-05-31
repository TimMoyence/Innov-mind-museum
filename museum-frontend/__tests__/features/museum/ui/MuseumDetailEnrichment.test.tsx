/**
 * QA-06 RED — MuseumDetailEnrichment rich sections + skeleton + graceful empty.
 *
 * Phase RED (UFR-022 fresh-context). These tests PROVE the absence of the
 * wanted behaviour in the current presentational component
 * (`features/museum/ui/MuseumDetailEnrichment.tsx`):
 *
 *  1. No section is rendered for the four rich JSONB fields
 *     (admission / collections / exhibitions / accessibility) even when the
 *     resolved enrichment carries them — today the component only knows about
 *     summary / hours / website / phone.
 *  2. The loading state is a plain spinner+text, NOT a structured skeleton
 *     (no `testID="museum-detail-skeleton"`).
 *  3. The resolved-empty state renders the dry `museum.no_extra_info` copy,
 *     NOT the graceful `museum.info_coming_soon` key.
 *
 * Discrimination: the i18n mock in `test-utils` returns the key verbatim, so
 * we assert on the i18n KEYS (`museum.admission`, `museum.collections`,
 * `museum.exhibitions`, `museum.accessibility`, `museum.info_coming_soon`) and
 * on the skeleton `testID`. None of these exist in the current source → every
 * assertion below FAILS now and passes after GREEN.
 *
 * The component is purely presentational (styles injected as a prop) so we
 * drive it directly with a factory-built enrichment view — no hook plumbing.
 */

import '../../../helpers/test-utils';
import type React from 'react';

import { MuseumDetailEnrichment } from '@/features/museum/ui/MuseumDetailEnrichment';
import { makeMuseumEnrichmentView } from '../../../helpers/factories/museum.factories';
import { renderWithQueryClient } from '../../../helpers/data/renderWithQueryClient';

// Minimal style stub: the component only spreads these into RN style arrays;
// the tests assert on rendered text / testIDs, never on style values.
const styleStub = {
  descCard: {},
  sectionTitle: {},
  description: {},
  heroImage: {},
  infoRow: {},
  hoursLabel: {},
  weeklyLine: {},
  contactRow: {},
  contactButton: {},
  contactButtonText: {},
  loadingRow: {},
  placeholderText: {},
} as const;

const renderEnrichment = (props: Partial<React.ComponentProps<typeof MuseumDetailEnrichment>>) =>
  renderWithQueryClient(
    <MuseumDetailEnrichment
      museumName="Musée d'Aquitaine"
      enriched={null}
      hoursDisplay={null}
      showEnrichmentLoader={false}
      showEmptyEnrichment={false}
      showErrorAsEmpty={false}
      styles={styleStub}
      {...props}
    />,
  );

describe('QA-06 — MuseumDetailEnrichment rich sections (R5/R6)', () => {
  it('renders an admission section when admissionFees is present', () => {
    const enriched = makeMuseumEnrichmentView({ admissionFees: { adult: '6 €' } });
    const view = renderEnrichment({ enriched });
    expect(view.queryByText('museum.admission')).not.toBeNull();
  });

  it('renders a collections section when collections is present', () => {
    const enriched = makeMuseumEnrichmentView({
      collections: { highlights: ['Préhistoire', 'XVIIIe siècle'] },
    });
    const view = renderEnrichment({ enriched });
    expect(view.queryByText('museum.collections')).not.toBeNull();
  });

  it('renders an accessibility section when accessibility is present', () => {
    const enriched = makeMuseumEnrichmentView({ accessibility: { wheelchairAccess: true } });
    const view = renderEnrichment({ enriched });
    expect(view.queryByText('museum.accessibility')).not.toBeNull();
  });

  it('hides every rich section when all four rich fields are null', () => {
    const enriched = makeMuseumEnrichmentView({ summary: 'Some summary.' });
    const view = renderEnrichment({ enriched });
    expect(view.queryByText('museum.admission')).toBeNull();
    expect(view.queryByText('museum.collections')).toBeNull();
    expect(view.queryByText('museum.exhibitions')).toBeNull();
    expect(view.queryByText('museum.accessibility')).toBeNull();
  });

  it('does not render the raw rich record value as [object Object]', () => {
    const enriched = makeMuseumEnrichmentView({ admissionFees: { adult: '6 €' } });
    const view = renderEnrichment({ enriched });
    expect(view.queryByText('[object Object]')).toBeNull();
  });
});

describe('QA-06 — MuseumDetailEnrichment skeleton (R8)', () => {
  it('renders a structured skeleton (testID) while loading with no data yet', () => {
    const view = renderEnrichment({ enriched: null, showEnrichmentLoader: true });
    expect(view.queryByTestId('museum-detail-skeleton')).not.toBeNull();
  });
});

describe('QA-06 — MuseumDetailEnrichment graceful empty state (R9/R10)', () => {
  it('shows the graceful "info coming soon" copy when resolved with no data', () => {
    const view = renderEnrichment({
      enriched: makeMuseumEnrichmentView(),
      showEmptyEnrichment: true,
    });
    expect(view.queryByText('museum.info_coming_soon')).not.toBeNull();
  });

  it('shows the graceful empty copy on error-as-empty too', () => {
    const view = renderEnrichment({ enriched: null, showErrorAsEmpty: true });
    expect(view.queryByText('museum.info_coming_soon')).not.toBeNull();
  });
});
