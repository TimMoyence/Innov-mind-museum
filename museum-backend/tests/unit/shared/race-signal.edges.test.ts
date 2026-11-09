import { errorMessage } from '@shared/errors/error-message';
import { raceSignal } from '@shared/utils/race-signal';

const timeout = (): Error => new Error('délai dépassé');

describe('raceSignal · cas limites', () => {
  it('rejette avec l’erreur de délai quand le signal est déjà abandonné', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(raceSignal(Promise.resolve(1), controller.signal, timeout)).rejects.toThrow(
      'délai dépassé',
    );
  });

  it('rend la valeur du travail quand il finit avant l’abandon, et ignore l’abandon ensuite', async () => {
    const controller = new AbortController();
    const result = raceSignal(Promise.resolve('fait'), controller.signal, timeout);

    await expect(result).resolves.toBe('fait');
    controller.abort();
    await expect(result).resolves.toBe('fait');
  });

  it('rejette avec l’erreur de délai quand l’abandon arrive avant la fin du travail', async () => {
    const controller = new AbortController();
    const result = raceSignal(new Promise<number>(() => undefined), controller.signal, timeout);

    controller.abort();

    await expect(result).rejects.toThrow('délai dépassé');
  });

  it('transmet l’échec du travail quand il échoue avant l’abandon', async () => {
    const controller = new AbortController();

    await expect(
      raceSignal(Promise.reject(new Error('panne')), controller.signal, timeout),
    ).rejects.toThrow('panne');
  });
});

describe('errorMessage · cas limites', () => {
  it('rend le message d’une Error et la forme texte de toute autre valeur', () => {
    expect(errorMessage(new TypeError('cassé'))).toBe('cassé');
    expect(errorMessage('brut')).toBe('brut');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('undefined');
    expect(errorMessage(null)).toBe('null');
  });
});
