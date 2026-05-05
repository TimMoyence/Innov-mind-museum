import '../../helpers/test-utils';
import { renderHook } from '@testing-library/react-native';

import type {
  MuseumEnrichmentView,
  ParsedOpeningHours,
} from '@/features/museum/infrastructure/museumApi';
import type {
  UseMuseumEnrichmentResult,
  UseMuseumEnrichmentStatus,
} from '@/features/museum/application/useMuseumEnrichment';
import type { OpeningHoursDisplay } from '@/features/museum/application/opening-hours.formatter';

// ── Module mocks ─────────────────────────────────────────────────────────────
// Declared BEFORE the SUT import so jest hoisting wires them correctly.

const mockUseMuseumEnrichment = jest.fn<UseMuseumEnrichmentResult, [number | null, string]>();
const mockFormatOpeningHours = jest.fn();

jest.mock('@/features/museum/application/useMuseumEnrichment', () => ({
  useMuseumEnrichment: (museumId: number | null, locale: string) =>
    mockUseMuseumEnrichment(museumId, locale),
}));

jest.mock('@/features/museum/application/opening-hours.formatter', () => ({
  formatOpeningHours: (hours: ParsedOpeningHours | null, t: unknown) =>
    mockFormatOpeningHours(hours, t),
}));

import { useMuseumSheetEnrichmentData } from '@/features/museum/application/useMuseumSheetEnrichmentData';
import { makeMuseumWithDistance as makeMuseum } from '../../helpers/factories/museum.factories';

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

const setEnrichment = (
  status: UseMuseumEnrichmentStatus,
  data: MuseumEnrichmentView | null,
): void => {
  mockUseMuseumEnrichment.mockReturnValue({ data, status, refresh: jest.fn() });
};

const setHoursDisplay = (display: OpeningHoursDisplay | null): void => {
  mockFormatOpeningHours.mockReturnValue(display);
};

// Mirrors test-utils.tsx theme values consumed by the hook.
const THEME_SUCCESS = '#166534';
const THEME_WARNING_TEXT = '#92400E';
const THEME_TEXT_SECONDARY = '#334155';

const tFn = (key: string): string => key;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useMuseumSheetEnrichmentData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHoursDisplay(null);
  });

  it('passes null to useMuseumEnrichment for synthetic OSM museums (negative id)', () => {
    setEnrichment('idle', null);
    const museum = makeMuseum({ id: -42 });
    renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(mockUseMuseumEnrichment).toHaveBeenCalledWith(null, 'en');
  });

  it('passes null to useMuseumEnrichment when museum is null', () => {
    setEnrichment('idle', null);
    renderHook(() => useMuseumSheetEnrichmentData(null, 'en', tFn));
    expect(mockUseMuseumEnrichment).toHaveBeenCalledWith(null, 'en');
  });

  it('returns hoursDisplay = null and skips formatOpeningHours when enrichment.data is null', () => {
    setEnrichment('ready', null);
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hoursDisplay).toBeNull();
    expect(mockFormatOpeningHours).not.toHaveBeenCalled();
  });

  it('maps hours tone "positive" to theme.success', () => {
    setEnrichment('ready', makeEnrichment({ openingHours: { raw: 'open' } as ParsedOpeningHours }));
    setHoursDisplay({ label: 'Open', tone: 'positive', weeklyLines: [] });
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hoursToneColor).toBe(THEME_SUCCESS);
  });

  it('maps hours tone "warning" to theme.warningText', () => {
    setEnrichment(
      'ready',
      makeEnrichment({ openingHours: { raw: 'closed' } as ParsedOpeningHours }),
    );
    setHoursDisplay({ label: 'Closed', tone: 'warning', weeklyLines: [] });
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hoursToneColor).toBe(THEME_WARNING_TEXT);
  });

  it('falls back to theme.textSecondary when hoursDisplay is null', () => {
    setEnrichment('ready', null);
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hoursToneColor).toBe(THEME_TEXT_SECONDARY);
  });

  it('returns showEnrichmentLoader=true while status="loading" and data is null', () => {
    setEnrichment('loading', null);
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.showEnrichmentLoader).toBe(true);
  });

  it('returns showEnrichmentLoader=false once data has arrived even if status is still loading', () => {
    setEnrichment('loading', makeEnrichment({ summary: 'cached' }));
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.showEnrichmentLoader).toBe(false);
  });

  it('reports hasRichContent=true when only imageUrl is present', () => {
    setEnrichment('ready', makeEnrichment({ imageUrl: 'https://example.test/h.jpg' }));
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hasRichContent).toBe(true);
  });

  it('reports hasRichContent=false when enrichment is fully empty and no hours', () => {
    setEnrichment('ready', makeEnrichment());
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hasRichContent).toBe(false);
  });

  it('reports hasRichContent=true when only hours are available', () => {
    setEnrichment('ready', makeEnrichment({ openingHours: { raw: 'open' } as ParsedOpeningHours }));
    setHoursDisplay({ label: 'Open', tone: 'neutral', weeklyLines: [] });
    const museum = makeMuseum({ id: 42 });
    const { result } = renderHook(() => useMuseumSheetEnrichmentData(museum, 'en', tFn));
    expect(result.current.hasRichContent).toBe(true);
  });
});
