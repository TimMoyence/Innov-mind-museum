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

jest.mock('expo-file-system', () => ({
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
