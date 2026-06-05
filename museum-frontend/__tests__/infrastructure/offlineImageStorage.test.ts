import {
  persistOfflineImage,
  isPersistedOfflineImage,
  cleanupOfflineImage,
  cleanupOfflineImages,
} from '@/features/chat/application/offlineImageStorage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
const mockCopyAsync = jest.fn().mockResolvedValue(undefined);
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-file-system/legacy', () => ({
  // Must be a plain string literal — hoisted above const declarations
  documentDirectory: 'file:///data/user/0/com.musaium/files/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  copyAsync: (...args: unknown[]) => mockCopyAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const OFFLINE_DIR = 'file:///data/user/0/com.musaium/files/offline-images/';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('offlineImageStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: true });
  });

  describe('persistOfflineImage', () => {
    it('creates the offline-images directory if it does not exist', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });

      const result = await persistOfflineImage('file:///tmp/photo.jpg');

      expect(mockMakeDirectoryAsync).toHaveBeenCalledWith(OFFLINE_DIR, { intermediates: true });
      expect(result).toContain(OFFLINE_DIR);
    });

    it('skips directory creation when it already exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true });

      await persistOfflineImage('file:///tmp/photo.jpg');

      expect(mockMakeDirectoryAsync).not.toHaveBeenCalled();
    });

    it('copies the temp file to the offline-images directory', async () => {
      const tempUri = 'file:///tmp/camera-photo.jpg';

      const result = await persistOfflineImage(tempUri);

      expect(mockCopyAsync).toHaveBeenCalledWith({
        from: tempUri,
        to: expect.stringContaining(OFFLINE_DIR),
      });
      expect(result).toMatch(/\.jpg$/);
    });

    it('generates filenames with img- prefix', async () => {
      const result = await persistOfflineImage('file:///tmp/a.jpg');

      expect(result).toContain(OFFLINE_DIR);
      expect(result).toContain('img-');
    });
  });

  describe('isPersistedOfflineImage', () => {
    it('returns true for URIs in the offline-images directory', () => {
      const uri = `${OFFLINE_DIR}img-12345-abc.jpg`;
      expect(isPersistedOfflineImage(uri)).toBe(true);
    });

    it('returns false for URIs outside the offline-images directory', () => {
      expect(isPersistedOfflineImage('file:///tmp/camera-photo.jpg')).toBe(false);
      expect(isPersistedOfflineImage('https://example.com/image.jpg')).toBe(false);
    });
  });

  describe('cleanupOfflineImage', () => {
    it('deletes an existing persisted image', async () => {
      const uri = `${OFFLINE_DIR}img-12345-abc.jpg`;
      mockGetInfoAsync.mockResolvedValue({ exists: true });

      await cleanupOfflineImage(uri);

      expect(mockDeleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
    });

    it('skips deletion for non-persisted URIs', async () => {
      await cleanupOfflineImage('file:///tmp/external.jpg');

      expect(mockGetInfoAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('skips deletion when file does not exist', async () => {
      const uri = `${OFFLINE_DIR}img-gone-abc.jpg`;
      mockGetInfoAsync.mockResolvedValue({ exists: false });

      await cleanupOfflineImage(uri);

      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('does not throw when deletion fails', async () => {
      const uri = `${OFFLINE_DIR}img-fail-abc.jpg`;
      mockGetInfoAsync.mockResolvedValue({ exists: true });
      mockDeleteAsync.mockRejectedValue(new Error('Permission denied'));

      await expect(cleanupOfflineImage(uri)).resolves.toBeUndefined();
    });
  });

  describe('cleanupOfflineImages', () => {
    it('cleans up multiple images in parallel', async () => {
      const uris = [`${OFFLINE_DIR}img-1-abc.jpg`, `${OFFLINE_DIR}img-2-def.jpg`];
      mockGetInfoAsync.mockResolvedValue({ exists: true });

      await cleanupOfflineImages(uris);

      expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
    });

    it('handles mixed persisted and non-persisted URIs', async () => {
      const uris = [`${OFFLINE_DIR}img-1-abc.jpg`, 'file:///tmp/external.jpg'];
      mockGetInfoAsync.mockResolvedValue({ exists: true });

      await cleanupOfflineImages(uris);

      // Only the persisted one should trigger getInfoAsync/deleteAsync
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// W1-D4-FE-03 — dedicated capped image cache (carnet re-download). ADDED block
// (the original describe above is byte-frozen for green; these tests pin the
// NEW capped-cache surface: getCachedImage / cacheRemoteImage with LRU + maxAge
// eviction + post-wipe miss). Mocks the same `expo-file-system/legacy` module,
// augmented at runtime with the extra FS methods the capped cache needs
// (downloadAsync / readDirectoryAsync / getFreeDiskStorageAsync) — purely
// additive, the original 4-method factory is untouched.
// ─────────────────────────────────────────────────────────────────────────────

interface CappedCacheModule {
  getCachedImage(key: string): Promise<string | null>;
  cacheRemoteImage(key: string, remoteUrl: string): Promise<string | null>;
}

interface AugmentedFs {
  downloadAsync: jest.Mock;
  readDirectoryAsync: jest.Mock;
  getFreeDiskStorageAsync: jest.Mock;
  writeAsStringAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
}

describe('offlineImageStorage — capped image cache (W1-D4-FE-03)', () => {
  const CACHED_DIR = OFFLINE_DIR;
  let cappedCache: CappedCacheModule;
  let fs: AugmentedFs;

  beforeAll(() => {
    // Augment the already-mocked module with the extra FS surface the capped
    // cache relies on. requireMock returns the SAME mocked object the source
    // under test imports.
    const mockedFs = jest.requireMock('expo-file-system/legacy');
    mockedFs.downloadAsync = jest.fn();
    mockedFs.readDirectoryAsync = jest.fn();
    mockedFs.getFreeDiskStorageAsync = jest.fn();
    mockedFs.writeAsStringAsync = jest.fn();
    mockedFs.readAsStringAsync = jest.fn();
    fs = mockedFs as unknown as AugmentedFs;

    // RED: these exports do not exist yet → require throws / undefined access.
    cappedCache = jest.requireActual('@/features/chat/application/offlineImageStorage');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: true });
    fs.downloadAsync.mockResolvedValue({ uri: `${CACHED_DIR}downloaded.jpg`, status: 200 });
    fs.readDirectoryAsync.mockResolvedValue([]);
    fs.getFreeDiskStorageAsync.mockResolvedValue(1_000_000_000);
    fs.writeAsStringAsync.mockResolvedValue(undefined);
    fs.readAsStringAsync.mockResolvedValue('{}');
  });

  describe('getCachedImage', () => {
    it('returns null when the cached file is absent (post-wipe miss)', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });

      const result = await cappedCache.getCachedImage('msg-wiped');

      expect(result).toBeNull();
    });

    it('returns the cached uri when the file exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1_000 });

      const result = await cappedCache.getCachedImage('msg-present');

      expect(typeof result).toBe('string');
      expect(result).toContain(CACHED_DIR);
    });
  });

  describe('cacheRemoteImage — cap enforcement', () => {
    it('measures the downloaded derivative size via getInfoAsync', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 2_048 });

      await cappedCache.cacheRemoteImage('msg-new', 'https://signed.example.com/fresh.jpg');

      // The freshly-downloaded file is stat'd so its size counts against the cap.
      expect(mockGetInfoAsync).toHaveBeenCalled();
      expect(fs.downloadAsync).toHaveBeenCalled();
    });

    it('evicts LRU files via deleteAsync when the write pushes the cache over cap', async () => {
      // Two pre-existing large entries + a large new download → over the
      // dedicated cap → at least one LRU file must be deleted.
      fs.readDirectoryAsync.mockResolvedValue(['old-lru.jpg', 'recent.jpg', 'index.json']);
      const HUGE = 200 * 1024 * 1024; // 200 MB each — guaranteed over any sane cap
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: HUGE });

      await cappedCache.cacheRemoteImage('msg-overflow', 'https://signed.example.com/big.jpg');

      expect(mockDeleteAsync).toHaveBeenCalled();
    });
  });
});
