import '../../helpers/test-utils';
import { renderHook, waitFor } from '@testing-library/react-native';

const mockGetMessageImageUrl = jest.fn<Promise<{ url: string; expiresAt: string }>, [string]>();

jest.mock('@/features/chat/infrastructure/chatApi/image', () => ({
  getMessageImageUrl: (messageId: string) => mockGetMessageImageUrl(messageId),
}));

const mockGetCachedImage = jest.fn<Promise<string | null>, [string]>();
const mockCacheRemoteImage = jest.fn<Promise<string | null>, [string, string]>();

jest.mock('@/features/chat/application/offlineImageStorage', () => ({
  getCachedImage: (key: string) => mockGetCachedImage(key),
  cacheRemoteImage: (key: string, remoteUrl: string) => mockCacheRemoteImage(key, remoteUrl),
}));

import { useCarnetImageSource } from '@/features/chat/application/useCarnetImageSource';

const MESSAGE_ID = 'msg-carnet-1';
const FALLBACK_URL = 'https://api.musaium.com/api/chat/messages/msg-carnet-1/image?token=stale';

describe('useCarnetImageSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedImage.mockResolvedValue(null);
    mockGetMessageImageUrl.mockResolvedValue({
      url: 'https://signed.example.com/fresh.jpg',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
    mockCacheRemoteImage.mockResolvedValue('file:///offline-images/cached.jpg');
  });

  it('prefers an existing local derivative without any network call', async () => {
    const localUri = 'file:///offline-images/local-derivative.jpg';
    mockGetCachedImage.mockResolvedValue(localUri);

    const { result } = renderHook(() =>
      useCarnetImageSource({
        messageId: MESSAGE_ID,
        fallbackUrl: FALLBACK_URL,
      }),
    );

    await waitFor(() => {
      expect(result.current.uri).toBe(localUri);
    });

    expect(mockGetMessageImageUrl).not.toHaveBeenCalled();
    expect(mockCacheRemoteImage).not.toHaveBeenCalled();
  });

  it('re-mints a fresh signed URL and repopulates the cache on a miss (post-wipe)', async () => {
    mockGetCachedImage.mockResolvedValue(null);
    const cachedUri = 'file:///offline-images/redownloaded.jpg';
    mockCacheRemoteImage.mockResolvedValue(cachedUri);

    const { result } = renderHook(() =>
      useCarnetImageSource({
        messageId: MESSAGE_ID,
        fallbackUrl: FALLBACK_URL,
      }),
    );

    await waitFor(() => {
      expect(result.current.uri).toBe(cachedUri);
    });

    expect(mockGetMessageImageUrl).toHaveBeenCalledWith(MESSAGE_ID);
    expect(mockCacheRemoteImage).toHaveBeenCalledWith(
      MESSAGE_ID,
      'https://signed.example.com/fresh.jpg',
    );
  });

  it('falls back to message.image.url without throwing when re-mint fails', async () => {
    mockGetCachedImage.mockResolvedValue(null);
    mockGetMessageImageUrl.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      useCarnetImageSource({
        messageId: MESSAGE_ID,
        fallbackUrl: FALLBACK_URL,
      }),
    );

    await waitFor(() => {
      expect(result.current.uri).toBe(FALLBACK_URL);
    });

    expect(mockCacheRemoteImage).not.toHaveBeenCalled();
  });

  it('ignores a late resolution after unmount (closure-cell cancel)', async () => {
    let resolveCached: (value: string | null) => void = () => undefined;
    mockGetCachedImage.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveCached = resolve;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCarnetImageSource({
        messageId: MESSAGE_ID,
        fallbackUrl: FALLBACK_URL,
      }),
    );

    unmount();
    resolveCached('file:///offline-images/late.jpg');

    await waitFor(() => {
      expect(mockGetMessageImageUrl).not.toHaveBeenCalled();
    });
    expect(result.current.uri).not.toBe('file:///offline-images/late.jpg');
  });
});
