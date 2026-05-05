import { AppState } from 'react-native';
import { renderHook } from '@testing-library/react-native';

import { useAuthAppStateSync } from '@/features/auth/application/useAuthAppStateSync';

const mockGetAccessToken = jest.fn<string, []>();

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
}));

type Handler = (status: 'active' | 'background' | 'inactive') => void;

const buildValidJwt = (expiresInMs: number): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor((Date.now() + expiresInMs) / 1000), sub: '42' }),
  ).toString('base64');
  return `${header}.${payload}.sig`;
};

describe('useAuthAppStateSync', () => {
  let handlers: Handler[];
  let removeSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = [];
    removeSpy = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((evt, cb) => {
      if (evt === 'change') handlers.push(cb as unknown as Handler);
      return { remove: removeSpy } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to AppState changes on mount and unsubscribes on unmount', () => {
    const refresh = jest.fn().mockResolvedValue(null);
    const { unmount } = renderHook(() => { useAuthAppStateSync(refresh); });

    expect(handlers.length).toBe(1);
    unmount();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('does not refresh when access token has plenty of time left', () => {
    const refresh = jest.fn().mockResolvedValue('new-token');
    mockGetAccessToken.mockReturnValue(buildValidJwt(60 * 60 * 1000));

    renderHook(() => { useAuthAppStateSync(refresh); });
    handlers[0]!('background');
    handlers[0]!('active');

    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when access token is about to expire within 2 min', () => {
    const refresh = jest.fn().mockResolvedValue('new-token');
    mockGetAccessToken.mockReturnValue(buildValidJwt(60 * 1000));

    renderHook(() => { useAuthAppStateSync(refresh); });
    handlers[0]!('background');
    handlers[0]!('active');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('throttles consecutive foreground refreshes to one per minute', () => {
    const refresh = jest.fn().mockResolvedValue('new-token');
    mockGetAccessToken.mockReturnValue(buildValidJwt(30 * 1000));

    renderHook(() => { useAuthAppStateSync(refresh); });
    handlers[0]!('background');
    handlers[0]!('active');
    handlers[0]!('background');
    handlers[0]!('active');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('calls onForeground with the background duration', () => {
    const refresh = jest.fn().mockResolvedValue(null);
    const onForeground = jest.fn();
    mockGetAccessToken.mockReturnValue(buildValidJwt(60 * 60 * 1000));

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000_000); // background at 1,000,000
    nowSpy.mockReturnValueOnce(1_045_000); // active at 1,045,000 (45s later)
    nowSpy.mockReturnValue(1_045_000);

    renderHook(() => { useAuthAppStateSync(refresh, { onForeground }); });
    handlers[0]!('background');
    handlers[0]!('active');

    expect(onForeground).toHaveBeenCalledWith(45_000);
  });
});
