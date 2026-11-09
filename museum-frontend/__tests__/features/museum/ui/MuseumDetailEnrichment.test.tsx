import '../../../helpers/test-utils';
import type React from 'react';

import { MuseumDetailEnrichment } from '@/features/museum/ui/MuseumDetailEnrichment';
import { makeMuseumEnrichmentView } from '../../../helpers/factories/museum.factories';
import { renderWithQueryClient } from '../../../helpers/data/renderWithQueryClient';

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
