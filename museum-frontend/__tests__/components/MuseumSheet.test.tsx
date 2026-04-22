import '../helpers/test-utils';
import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import type {
  MuseumEnrichmentView,
  ParsedOpeningHours,
} from '@/features/museum/infrastructure/museumApi';
import type {
  UseMuseumEnrichmentResult,
  UseMuseumEnrichmentStatus,
} from '@/features/museum/application/useMuseumEnrichment';

// ── Enrichment hook mock ─────────────────────────────────────────────────────
// Declared BEFORE the SUT import so jest hoisting wires the mock correctly.

const mockUseMuseumEnrichment = jest.fn<UseMuseumEnrichmentResult, [number | null, string]>();

jest.mock('@/features/museum/application/useMuseumEnrichment', () => ({
  useMuseumEnrichment: (museumId: number | null, locale: string) =>
    mockUseMuseumEnrichment(museumId, locale),
}));

import { MuseumSheet } from '@/features/museum/ui/MuseumSheet';
import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';
import { renderWithQueryClient } from '../helpers/data/renderWithQueryClient';

// MuseumSheet still needs a QueryClient in scope for any descendants relying
// on react-query context (the hook itself is mocked at this layer).
const render = (ui: ReactElement) => renderWithQueryClient(ui);

// ── Enrichment fixture + helpers ─────────────────────────────────────────────

const makeEnrichment = (overrides?: Partial<MuseumEnrichmentView>): MuseumEnrichmentView => ({
  museumId: 42,
  locale: 'en',
  summary: null,
  wikidataQid: null,
  website: null,
  phone: null,
  imageUrl: null,
  openingHours: null,
  fetchedAt: '2026-04-22T10:00:00.000Z',
  ...overrides,
});

/** Weekly schedule with deterministic Mon–Fri 10-18, weekend closed. */
const makeOpeningHours = (): ParsedOpeningHours => ({
  raw: 'Mo-Fr 10:00-18:00',
  status: 'open',
  statusReason: 'currently_open',
  closesAtLocal: '18:00',
  opensAtLocal: null,
  weekly: [
    { day: 'mon', opens: '10:00', closes: '18:00' },
    { day: 'tue', opens: '10:00', closes: '18:00' },
    { day: 'wed', opens: '10:00', closes: '18:00' },
    { day: 'thu', opens: '10:00', closes: '18:00' },
    { day: 'fri', opens: '10:00', closes: '18:00' },
    { day: 'sat', opens: null, closes: null },
    { day: 'sun', opens: null, closes: null },
  ],
});

/** Installs a default "ready with no enrichment" return on the hook mock. */
const setEnrichmentResult = (
  status: UseMuseumEnrichmentStatus,
  data: MuseumEnrichmentView | null,
): void => {
  mockUseMuseumEnrichment.mockReturnValue({
    data,
    status,
    refresh: jest.fn(),
  });
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MuseumSheet', () => {
  const baseProps = {
    onClose: jest.fn(),
    onStartChat: jest.fn(),
    onOpenInMaps: jest.fn(),
    onViewDetails: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default state: ready + no enrichment data (legacy behavior).
    setEnrichmentResult('ready', null);
  });

  it('renders nothing when museum is null', () => {
    render(<MuseumSheet museum={null} {...baseProps} />);
    expect(screen.queryByLabelText('museumDirectory.start_chat')).toBeNull();
  });

  it('renders museum name, address and distance when provided', () => {
    const museum = makeMuseum({
      name: 'Cap Sciences',
      address: '20 Quai de Bacalan',
      distanceMeters: 2_996_000,
    });
    render(<MuseumSheet museum={museum} {...baseProps} />);

    expect(screen.getByText('Cap Sciences')).toBeTruthy();
    expect(screen.getByText('20 Quai de Bacalan')).toBeTruthy();
    expect(screen.getByText('museumDirectory.distance_km')).toBeTruthy();
  });

  it('invokes onStartChat with the museum when primary button pressed', () => {
    const museum = makeMuseum();
    render(<MuseumSheet museum={museum} {...baseProps} />);
    fireEvent.press(screen.getByLabelText('museumDirectory.start_chat'));
    expect(baseProps.onStartChat).toHaveBeenCalledWith(museum);
  });

  it('invokes onOpenInMaps when maps button pressed', () => {
    const museum = makeMuseum({ latitude: 44.86, longitude: -0.55 });
    render(<MuseumSheet museum={museum} {...baseProps} />);
    fireEvent.press(screen.getByLabelText('museumDirectory.open_in_maps'));
    expect(baseProps.onOpenInMaps).toHaveBeenCalledWith(museum);
  });

  it('invokes onViewDetails when view-details button pressed', () => {
    const museum = makeMuseum();
    render(<MuseumSheet museum={museum} {...baseProps} />);
    fireEvent.press(screen.getByLabelText('museumDirectory.view_details'));
    expect(baseProps.onViewDetails).toHaveBeenCalledWith(museum);
  });

  it('hides the maps button when coordinates are missing', () => {
    const museum = makeMuseum({ latitude: null, longitude: null });
    render(<MuseumSheet museum={museum} {...baseProps} />);
    expect(screen.queryByLabelText('museumDirectory.open_in_maps')).toBeNull();
  });

  it('shows the localized category label', () => {
    const museum = makeMuseum({ museumType: 'art' });
    render(<MuseumSheet museum={museum} {...baseProps} />);
    expect(screen.getByText('museumDirectory.category.art')).toBeTruthy();
  });

  describe('enriched rendering', () => {
    it('shows the hero image when enrichment.imageUrl is present', () => {
      setEnrichmentResult(
        'ready',
        makeEnrichment({ imageUrl: 'https://cdn.example.org/hero.jpg' }),
      );
      const museum = makeMuseum({ name: 'Louvre' });
      render(<MuseumSheet museum={museum} {...baseProps} />);
      // Image surfaces via its a11y label (museum.name).
      expect(screen.getByLabelText('Louvre')).toBeTruthy();
    });

    it('renders the Wikidata summary when enrichment.summary is present', () => {
      const summary = 'The Louvre is the world-famous art museum.';
      setEnrichmentResult('ready', makeEnrichment({ summary }));
      render(<MuseumSheet museum={makeMuseum()} {...baseProps} />);

      expect(screen.getByText(summary)).toBeTruthy();
      expect(screen.getByText('museumDirectory.enrichment.summary_heading')).toBeTruthy();
    });

    it('renders the website button and opens the URL via Linking', () => {
      const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      setEnrichmentResult('ready', makeEnrichment({ website: 'https://example.org' }));

      render(<MuseumSheet museum={makeMuseum()} {...baseProps} />);
      const btn = screen.getByLabelText('museumDirectory.enrichment.website');
      fireEvent.press(btn);
      expect(openSpy).toHaveBeenCalledWith('https://example.org');
      openSpy.mockRestore();
    });

    it('renders the phone button and opens a tel: URL via Linking', () => {
      const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      setEnrichmentResult('ready', makeEnrichment({ phone: '+33123456789' }));

      render(<MuseumSheet museum={makeMuseum()} {...baseProps} />);
      const btn = screen.getByLabelText('museumDirectory.enrichment.phone');
      fireEvent.press(btn);
      expect(openSpy).toHaveBeenCalledWith('tel:+33123456789');
      openSpy.mockRestore();
    });

    it('renders opening hours heading + weekly lines when enrichment carries openingHours', () => {
      setEnrichmentResult('ready', makeEnrichment({ openingHours: makeOpeningHours() }));
      render(<MuseumSheet museum={makeMuseum()} {...baseProps} />);

      expect(screen.getByText('museumDirectory.enrichment.hours_heading')).toBeTruthy();
      // At least one weekly line surfaces the translator interpolation keys —
      // we don't pin the exact translated string here (covered by the
      // formatter unit tests) but we confirm the section rendered at all.
      expect(screen.queryAllByText(/museumDirectory\.enrichment\.weekly_/).length).toBeGreaterThan(
        0,
      );
    });

    it('shows the loading placeholder while enrichment is loading and data is absent', () => {
      setEnrichmentResult('loading', null);
      render(<MuseumSheet museum={makeMuseum()} {...baseProps} />);
      expect(screen.getByText('museumDirectory.enrichment.loading')).toBeTruthy();
      // No unavailable placeholder while we are actively loading.
      expect(screen.queryByText('museumDirectory.enrichment.unavailable')).toBeNull();
    });

    it('shows the discreet "unavailable" placeholder when enrichment fails and there is no rich content', () => {
      setEnrichmentResult('error', null);
      render(<MuseumSheet museum={makeMuseum()} {...baseProps} />);
      expect(screen.getByText('museumDirectory.enrichment.unavailable')).toBeTruthy();
    });
  });
});
