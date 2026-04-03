import { optimizeImageForUpload } from '@/features/chat/application/imageUploadOptimization';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetInfoAsync = jest.fn();
const mockManipulateAsync = jest.fn();
let mockGetSizeCallback: ((width: number, height: number) => void) | undefined;
let mockGetSizeErrorCallback: ((error: unknown) => void) | undefined;

jest.mock('expo-file-system', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

jest.mock('react-native', () => ({
  Image: {
    getSize: (
      _uri: string,
      onSuccess: (w: number, h: number) => void,
      onError: (e: unknown) => void,
    ) => {
      mockGetSizeCallback = onSuccess;
      mockGetSizeErrorCallback = onError;
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const setupImageMocks = (opts: {
  fileSize: number;
  width: number;
  height: number;
  optimizedSize?: number;
}) => {
  mockGetInfoAsync.mockImplementation((_uri: string, _options?: unknown) => {
    return Promise.resolve({ exists: true, size: opts.fileSize });
  });

  // Override getSize to resolve synchronously via microtask
  const { Image } = require('react-native');
  Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
    // Resolve via microtask to simulate async
    Promise.resolve().then(() => {
      onSuccess(opts.width, opts.height);
    });
  };

  const optimizedFileSize = opts.optimizedSize ?? 1_000_000;
  mockManipulateAsync.mockImplementation(() =>
    Promise.resolve({ uri: 'file:///tmp/optimized.jpg' }),
  );

  // Make getInfoAsync return optimizedSize for subsequent calls (after first)
  let callCount = 0;
  mockGetInfoAsync.mockImplementation((_uri: string, _options?: unknown) => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve({ exists: true, size: opts.fileSize });
    }
    return Promise.resolve({ exists: true, size: optimizedFileSize });
  });
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('imageUploadOptimization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the original URI for small images that need no optimization', async () => {
    const smallUri = 'file:///tmp/small-photo.jpg';

    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 500_000 }); // 500KB < 2.7MB

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
      Promise.resolve().then(() => {
        onSuccess(800, 600);
      }); // < 1600px
    };

    const result = await optimizeImageForUpload(smallUri);
    expect(result).toBe(smallUri);
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it('resizes oversized images whose longest dimension exceeds 1600px', async () => {
    setupImageMocks({ fileSize: 5_000_000, width: 4032, height: 3024 });

    const result = await optimizeImageForUpload('file:///tmp/large-photo.jpg');

    expect(result).toBe('file:///tmp/optimized.jpg');
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      expect.any(String),
      [{ resize: { width: 1600 } }],
      expect.objectContaining({ compress: expect.any(Number), format: 'jpeg' }),
    );
  });

  it('resizes by height when portrait image exceeds 1600px', async () => {
    setupImageMocks({ fileSize: 5_000_000, width: 3024, height: 4032 });

    await optimizeImageForUpload('file:///tmp/portrait.jpg');

    expect(mockManipulateAsync).toHaveBeenCalledWith(
      expect.any(String),
      [{ resize: { height: 1600 } }],
      expect.objectContaining({ format: 'jpeg' }),
    );
  });

  it('uses progressive quality compression for large files', async () => {
    // File starts at 5MB, optimized size stays above target after first pass
    let passCount = 0;
    mockGetInfoAsync.mockImplementation(() => {
      passCount++;
      if (passCount === 1) {
        return Promise.resolve({ exists: true, size: 5_000_000 });
      }
      // Each pass reduces size; second pass still above target, third below
      if (passCount === 2) {
        return Promise.resolve({ exists: true, size: 3_500_000 }); // still > 2.7MB
      }
      return Promise.resolve({ exists: true, size: 2_000_000 }); // below target
    });

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
      Promise.resolve().then(() => {
        onSuccess(1200, 900);
      }); // no resize needed
    };

    mockManipulateAsync.mockResolvedValue({ uri: 'file:///tmp/optimized.jpg' });

    const result = await optimizeImageForUpload('file:///tmp/big.jpg');

    expect(result).toBe('file:///tmp/optimized.jpg');
    // First pass at 0.82, second at 0.72
    expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
    expect(mockManipulateAsync.mock.calls[0][2]).toEqual(
      expect.objectContaining({ compress: 0.82 }),
    );
    expect(mockManipulateAsync.mock.calls[1][2]).toEqual(
      expect.objectContaining({ compress: 0.72 }),
    );
  });

  it('stops compression early when file size drops below target', async () => {
    let passCount = 0;
    mockGetInfoAsync.mockImplementation(() => {
      passCount++;
      if (passCount === 1) {
        return Promise.resolve({ exists: true, size: 4_000_000 });
      }
      return Promise.resolve({ exists: true, size: 2_000_000 }); // below 2.7MB target
    });

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
      Promise.resolve().then(() => {
        onSuccess(1200, 900);
      });
    };

    mockManipulateAsync.mockResolvedValue({ uri: 'file:///tmp/optimized.jpg' });

    await optimizeImageForUpload('file:///tmp/medium.jpg');

    // Should stop after one pass since optimized size is already below target
    expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
  });

  it('returns the original URI when dimensions cannot be determined', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 500_000 });

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, _onSuccess: unknown, onError: (e: unknown) => void) => {
      Promise.resolve().then(() => {
        onError(new Error('Cannot get size'));
      });
    };

    const result = await optimizeImageForUpload('file:///tmp/unknown.jpg');

    // Small file + no dimensions = no optimization needed
    expect(result).toBe('file:///tmp/unknown.jpg');
  });

  it('returns undefined from getFileSize when file does not exist', async () => {
    // File doesn't exist: getFileSize returns undefined -> no optimization
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
      Promise.resolve().then(() => {
        onSuccess(800, 600);
      });
    };

    const result = await optimizeImageForUpload('file:///tmp/nonexistent.jpg');

    // initialSize is undefined, dimensions within limits = shouldOptimize is false
    expect(result).toBe('file:///tmp/nonexistent.jpg');
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it('returns last workingUri after all quality steps are exhausted', async () => {
    // File stays above target through all 5 quality steps
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 10_000_000 }); // Always 10MB

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
      Promise.resolve().then(() => {
        onSuccess(1200, 900);
      }); // No resize needed
    };

    mockManipulateAsync.mockResolvedValue({ uri: 'file:///tmp/still-large.jpg' });

    const result = await optimizeImageForUpload('file:///tmp/huge.jpg');

    // Should have tried all 5 quality steps (0.82, 0.72, 0.62, 0.52, 0.42)
    expect(mockManipulateAsync).toHaveBeenCalledTimes(5);
    expect(result).toBe('file:///tmp/still-large.jpg');
  });

  it('returns optimized URI when getFileSize returns undefined after compression', async () => {
    // Initial file is large, but after first compression getFileSize returns undefined
    let passCount = 0;
    mockGetInfoAsync.mockImplementation(() => {
      passCount++;
      if (passCount === 1) {
        return Promise.resolve({ exists: true, size: 5_000_000 });
      }
      // After compression, file info is unavailable
      return Promise.resolve({ exists: false });
    });

    const { Image } = require('react-native');
    Image.getSize = (_uri: string, onSuccess: (w: number, h: number) => void) => {
      Promise.resolve().then(() => {
        onSuccess(1200, 900);
      });
    };

    mockManipulateAsync.mockResolvedValue({ uri: 'file:///tmp/optimized.jpg' });

    const result = await optimizeImageForUpload('file:///tmp/big.jpg');

    // Should stop after one pass since optimizedSize is undefined (<= target check succeeds)
    expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    expect(result).toBe('file:///tmp/optimized.jpg');
  });
});
