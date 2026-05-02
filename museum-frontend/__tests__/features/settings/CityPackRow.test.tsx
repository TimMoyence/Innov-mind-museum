import { fireEvent, render } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { CityPackRow } from '@/features/settings/ui/CityPackRow';
import type { City } from '@/features/museum/infrastructure/cityCatalog';
import type { CityPackState } from '@/features/museum/application/useOfflinePacks';

// ── Fixtures ────────────────────────────────────────────────────────────────

const makeCity = (overrides: Partial<City> = {}): City => ({
  id: 'paris',
  name: 'Paris',
  bounds: [2.224, 48.815, 2.47, 48.902],
  center: [2.3522, 48.8566],
  ...overrides,
});

describe('CityPackRow', () => {
  let onDownload: jest.Mock;
  let onDelete: jest.Mock;

  beforeEach(() => {
    onDownload = jest.fn();
    onDelete = jest.fn();
  });

  // ── Status: absent ────────────────────────────────────────────────────────

  describe('status=absent', () => {
    const state: CityPackState = { status: 'absent' };

    it('renders the city name and absent status detail', () => {
      const { getByText } = render(
        <CityPackRow
          city={makeCity({ name: 'Lyon' })}
          state={state}
          onDownload={onDownload}
          onDelete={onDelete}
        />,
      );
      expect(getByText('Lyon')).toBeTruthy();
      expect(getByText('offlineMaps.absent')).toBeTruthy();
    });

    it('renders the Download button with i18n key', () => {
      const { getByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      expect(getByText('offlineMaps.download')).toBeTruthy();
    });

    it('exposes a download a11y label that includes the city name', () => {
      const { getByLabelText } = render(
        <CityPackRow
          city={makeCity({ name: 'Bordeaux' })}
          state={state}
          onDownload={onDownload}
          onDelete={onDelete}
        />,
      );
      // i18n mock returns the key, so the interpolated `{city}` placeholder
      // does not get filled — the label key itself is what we assert on.
      expect(getByLabelText('offlineMaps.download_a11y')).toBeTruthy();
    });

    it('calls onDownload with the city when the Download button is pressed', () => {
      const city = makeCity({ id: 'rome', name: 'Rome' });
      const { getByText } = render(
        <CityPackRow city={city} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      fireEvent.press(getByText('offlineMaps.download'));
      expect(onDownload).toHaveBeenCalledTimes(1);
      expect(onDownload).toHaveBeenCalledWith(city);
      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  // ── Status: active (downloading) ──────────────────────────────────────────

  describe('status=active', () => {
    const state: CityPackState = { status: 'active', percentage: 42.6, bytesOnDisk: 1024 };

    it('renders the rounded percentage with a percent sign', () => {
      const { getByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      // 42.6 rounds to 43.
      expect(getByText('43%')).toBeTruthy();
    });

    it('renders the downloading status detail', () => {
      const { getByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      expect(getByText('offlineMaps.downloading')).toBeTruthy();
    });

    it('does not render any action button while active', () => {
      const { queryByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      expect(queryByText('offlineMaps.download')).toBeNull();
      expect(queryByText('offlineMaps.delete')).toBeNull();
    });

    it('does not render the absent or ready details', () => {
      const { queryByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      expect(queryByText('offlineMaps.absent')).toBeNull();
      expect(queryByText('offlineMaps.ready_size')).toBeNull();
    });
  });

  // ── Status: complete ──────────────────────────────────────────────────────

  describe('status=complete', () => {
    it('renders the Delete button with i18n key', () => {
      const state: CityPackState = { status: 'complete', bytesOnDisk: 2 * 1024 * 1024 };
      const { getByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      expect(getByText('offlineMaps.delete')).toBeTruthy();
    });

    it('exposes a delete a11y label', () => {
      const state: CityPackState = { status: 'complete', bytesOnDisk: 1024 * 1024 };
      const { getByLabelText } = render(
        <CityPackRow
          city={makeCity({ name: 'Lisbonne' })}
          state={state}
          onDownload={onDownload}
          onDelete={onDelete}
        />,
      );
      expect(getByLabelText('offlineMaps.delete_a11y')).toBeTruthy();
    });

    it('renders the ready_size detail (one entry with the size token)', () => {
      const state: CityPackState = { status: 'complete', bytesOnDisk: 5 * 1024 * 1024 };
      const { getByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      // i18n mock returns the key without interpolation, so the assertion
      // is on the key itself; size formatting is exercised separately.
      expect(getByText('offlineMaps.ready_size')).toBeTruthy();
    });

    it('does not render the Download button when complete', () => {
      const state: CityPackState = { status: 'complete', bytesOnDisk: 0 };
      const { queryByText } = render(
        <CityPackRow city={makeCity()} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      expect(queryByText('offlineMaps.download')).toBeNull();
    });

    it('calls onDelete with the city when the Delete button is pressed', () => {
      const city = makeCity({ id: 'lisbon', name: 'Lisbonne' });
      const state: CityPackState = { status: 'complete', bytesOnDisk: 1024 };
      const { getByText } = render(
        <CityPackRow city={city} state={state} onDownload={onDownload} onDelete={onDelete} />,
      );
      fireEvent.press(getByText('offlineMaps.delete'));
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(city);
      expect(onDownload).not.toHaveBeenCalled();
    });
  });
});
