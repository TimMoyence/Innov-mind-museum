jest.mock('@/shared/infrastructure/connectivity/networkQualityTracker', () => ({
  recordQualitySample: jest.fn(),
}));

import { recordHttpQualitySample } from '@/shared/infrastructure/connectivity/qualitySampling';
import { recordQualitySample } from '@/shared/infrastructure/connectivity/networkQualityTracker';

const recordQualitySampleMock = recordQualitySample as jest.Mock;

describe('recordHttpQualitySample — horloge qui recule', () => {
  beforeEach(() => {
    recordQualitySampleMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('un RTT négatif (horloge reculée pendant la requête) n’entre pas dans le moteur', () => {
    jest.spyOn(Date, 'now').mockReturnValue(40_000);

    recordHttpQualitySample(
      { url: '/museums/42/low-data-pack', _startedAt: 100_000 },
      { ok: true, timedOut: false },
    );

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('un RTT de 0 ms reste un échantillon', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);

    recordHttpQualitySample(
      { url: '/museums/42/low-data-pack', _startedAt: 100_000 },
      { ok: true, timedOut: false },
    );

    expect(recordQualitySampleMock).toHaveBeenCalledWith({ rttMs: 0, ok: true, timedOut: false });
  });
});
