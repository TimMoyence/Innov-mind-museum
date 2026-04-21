import {
  getCurrentDataMode,
  setCurrentDataMode,
  subscribeDataMode,
  __resetDataModeForTests,
} from '@/shared/infrastructure/dataMode/currentDataMode';

describe('currentDataMode', () => {
  beforeEach(() => {
    __resetDataModeForTests();
  });

  it('defaults to normal', () => {
    expect(getCurrentDataMode()).toBe('normal');
  });

  it('updates when setCurrentDataMode is called with a new value', () => {
    setCurrentDataMode('low');
    expect(getCurrentDataMode()).toBe('low');
  });

  it('is a no-op when set to the current value', () => {
    const listener = jest.fn();
    subscribeDataMode(listener);
    setCurrentDataMode('normal');
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers on change', () => {
    const listener = jest.fn();
    subscribeDataMode(listener);
    setCurrentDataMode('low');
    expect(listener).toHaveBeenCalledWith('low');
  });

  it('unsubscribe stops notifications', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDataMode(listener);
    unsubscribe();
    setCurrentDataMode('low');
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates faulty subscribers from the notification chain', () => {
    const bad = jest.fn(() => {
      throw new Error('subscriber boom');
    });
    const good = jest.fn();
    subscribeDataMode(bad);
    subscribeDataMode(good);

    expect(() => { setCurrentDataMode('low'); }).not.toThrow();
    expect(good).toHaveBeenCalledWith('low');
  });
});
