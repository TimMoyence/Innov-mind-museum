import { OfflineManager, type OfflinePack } from '@maplibre/maplibre-react-native';

import { reportError } from '@/shared/observability/errorReporting';

export type CityId = string;

export interface CityPackRequest {
  cityId: CityId;
  /** `[west, south, east, north]` in WGS84. Matches MapLibre's LngLatBounds. */
  bounds: [number, number, number, number];
  mapStyleUrl: string;
  minZoom?: number;
  maxZoom?: number;
}

export interface CityPackSummary {
  id: string;
  cityId: CityId;
  bounds: [number, number, number, number];
  bytesOnDisk: number;
  percentage: number;
  state: 'inactive' | 'active' | 'complete';
}

export interface CityPackProgress {
  cityId: CityId;
  percentage: number;
  state: 'inactive' | 'active' | 'complete';
  bytesOnDisk: number;
}

const DEFAULT_MIN_ZOOM = 10;
const DEFAULT_MAX_ZOOM = 16;

/**
 * A pack's native id is opaque; we tag metadata with the cityId so the UI can
 * map packs back to the city catalog (Paris, Lyon, Bordeaux, Lisbonne, Rome).
 */
interface PackMetadata {
  cityId?: CityId;
}

const readCityId = (pack: OfflinePack): CityId | null => {
  const meta = pack.metadata as PackMetadata;
  return typeof meta.cityId === 'string' ? meta.cityId : null;
};

const toSummary = async (pack: OfflinePack): Promise<CityPackSummary | null> => {
  const cityId = readCityId(pack);
  if (!cityId) return null;
  const status = await pack.status();
  return {
    id: pack.id,
    cityId,
    bounds: pack.bounds,
    bytesOnDisk: status.completedResourceSize,
    percentage: status.percentage,
    state: status.state,
  };
};

/**
 * Thin wrapper around `OfflineManager` that speaks in terms of the app's
 * city catalog: requests carry a `cityId`, summaries return the cityId they
 * belong to. Progress events are forwarded to a callback so a React hook or
 * a settings screen can drive the download UX without re-implementing the
 * native listener glue.
 */
export const offlinePackManager = {
  async listPacks(): Promise<CityPackSummary[]> {
    const packs = await OfflineManager.getPacks();
    const summaries = await Promise.all(packs.map(toSummary));
    return summaries.filter((summary): summary is CityPackSummary => summary !== null);
  },

  async hasPack(cityId: CityId): Promise<boolean> {
    const packs = await OfflineManager.getPacks();
    return packs.some((pack) => readCityId(pack) === cityId);
  },

  async deletePackByCity(cityId: CityId): Promise<void> {
    const packs = await OfflineManager.getPacks();
    const target = packs.find((pack) => readCityId(pack) === cityId);
    if (!target) return;
    await OfflineManager.deletePack(target.id);
  },

  async downloadPack(
    request: CityPackRequest,
    onProgress: (progress: CityPackProgress) => void,
  ): Promise<CityPackSummary> {
    const existing = await this.listPacks();
    const alreadyPresent = existing.find((pack) => pack.cityId === request.cityId);
    if (alreadyPresent?.state === 'complete') {
      return alreadyPresent;
    }

    const pack = await OfflineManager.createPack(
      {
        mapStyle: request.mapStyleUrl,
        bounds: request.bounds,
        minZoom: request.minZoom ?? DEFAULT_MIN_ZOOM,
        maxZoom: request.maxZoom ?? DEFAULT_MAX_ZOOM,
        metadata: { cityId: request.cityId },
      },
      (_pack, status) => {
        onProgress({
          cityId: request.cityId,
          percentage: status.percentage,
          state: status.state,
          bytesOnDisk: status.completedResourceSize,
        });
      },
      (_pack, error) => {
        reportError(new Error(`OfflinePack download failed: ${error.message}`), {
          component: 'offlinePackManager',
          cityId: request.cityId,
        });
      },
    );

    const status = await pack.status();
    return {
      id: pack.id,
      cityId: request.cityId,
      bounds: pack.bounds,
      bytesOnDisk: status.completedResourceSize,
      percentage: status.percentage,
      state: status.state,
    };
  },
};
