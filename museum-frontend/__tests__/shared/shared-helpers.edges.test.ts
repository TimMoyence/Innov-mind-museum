import { BackHandler } from 'react-native';
import { renderHook } from '@testing-library/react-native';

import { formatBytes } from '@/shared/lib/formatBytes';
import { useHardwareBack } from '@/shared/ui/hooks/useHardwareBack';

describe('formatBytes · cas limites', () => {
  it('passe des Ko aux Mo exactement à 1 Mo', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('useHardwareBack · cas limites', () => {
  it('ne s’abonne pas au retour matériel tant que la feuille est fermée', () => {
    const subscribe = jest.spyOn(BackHandler, 'addEventListener');

    renderHook(() => {
      useHardwareBack(jest.fn(), false);
    });

    expect(subscribe).not.toHaveBeenCalled();
    subscribe.mockRestore();
  });

  it('consomme le retour matériel et se désabonne au démontage', () => {
    const remove = jest.fn();
    const subscribe = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
    const onBack = jest.fn();

    const { unmount } = renderHook(() => {
      useHardwareBack(onBack);
    });
    const handler = subscribe.mock.calls[0]?.[1];

    expect(handler?.()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    subscribe.mockRestore();
  });
});
