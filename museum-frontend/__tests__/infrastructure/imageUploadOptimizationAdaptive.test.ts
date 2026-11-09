import { optimizeImageAdaptive } from '@/features/chat/application/imageUploadOptimization';
import type { CompressionDecision } from '@/features/chat/application/compressionDecision.pure';

const mockGetInfoAsync = jest.fn();
const mockLoadAsync = jest.fn();

type RecordedEncode = [
  string,
  { resize: { width?: number; height?: number } }[],
  { format: string; compress: number },
];
const mockEncodeCalls: RecordedEncode[] = [];

type EncodeDriver = (encode: RecordedEncode) => Promise<{ uri: string }>;
let mockEncodeDriver: EncodeDriver = () => Promise.resolve({ uri: 'file:///tmp/upload.jpg' });
const mockEncode = (driver: EncodeDriver) => {
  mockEncodeDriver = driver;
};

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock('expo-image-manipulator', () => {
  const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } as const;

  const manipulate = (uri: string) => {
    const actions: { resize: { width?: number; height?: number } }[] = [];
    const ref = {
      saveAsync: (options: { format: string; compress: number }) => {
        const encode: RecordedEncode = [uri, actions, options];
        mockEncodeCalls.push(encode);
        return mockEncodeDriver(encode);
      },
    };
    const context = {
      resize: (size: { width?: number; height?: number }) => {
        actions.push({ resize: size });
        return context;
      },
      renderAsync: () => Promise.resolve(ref),
    };
    return context;
  };

  return {
    ImageManipulator: { manipulate },
    SaveFormat,
  };
});

jest.mock('expo-image', () => ({
  Image: {
    loadAsync: (...args: unknown[]) => mockLoadAsync(...args),
  },
}));

const EDGE_DECISION: CompressionDecision = {
  upload: { maxDimensionPx: 1024, format: 'webp', quality: 0.6, targetBytes: 150_000 },
  localDerivative: { maxDimensionPx: 1280, format: 'webp', quality: 0.7, targetBytes: 320_000 },
};

const FALLBACK_JPEG_DECISION: CompressionDecision = {
  upload: { maxDimensionPx: 1024, format: 'jpeg', quality: 0.55, targetBytes: 220_000 },
};

const setDimensions = (width: number, height: number) => {
  mockLoadAsync.mockImplementation(() => Promise.resolve({ width, height }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEncodeCalls.length = 0;
  mockEncodeDriver = () => Promise.resolve({ uri: 'file:///tmp/upload.jpg' });
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 5_000_000 });
  setDimensions(4032, 3024);
});

describe('optimizeImageAdaptive', () => {
  it('compresses the upload as WebP resized to 1024 and returns a .webp URI', async () => {
    mockEncode(() => Promise.resolve({ uri: 'file:///tmp/upload.webp' }));

    const result = await optimizeImageAdaptive('file:///tmp/source.jpg', {
      upload: EDGE_DECISION.upload,
    });

    expect(result.uploadUri).toMatch(/\.webp$/);
    const webpCall = mockEncodeCalls.find((call) => call[2].format === 'webp');
    expect(webpCall).toBeDefined();
    if (!webpCall) throw new Error('expected a WebP context encode');
    expect(webpCall[1]).toEqual([{ resize: { width: 1024 } }]);
    expect(webpCall[2]).toEqual(
      expect.objectContaining({ format: 'webp', compress: expect.any(Number) }),
    );
  });

  it('retries with JPEG q~0.55 @1024 when the WebP encode rejects', async () => {
    mockEncode((encode) => {
      if (encode[2].format === 'webp') {
        return Promise.reject(new Error('WebP not supported on this platform'));
      }
      return Promise.resolve({ uri: 'file:///tmp/upload.jpg' });
    });

    const result = await optimizeImageAdaptive('file:///tmp/source.jpg', {
      upload: EDGE_DECISION.upload,
    });

    expect(result.uploadUri).toMatch(/\.jpg$/);
    const jpegCall = mockEncodeCalls.find((call) => call[2].format === 'jpeg');
    expect(jpegCall).toBeDefined();
    if (!jpegCall) throw new Error('expected a JPEG fallback context encode');
    expect(jpegCall[1][0]?.resize.width).toBe(1024);
    expect(jpegCall[2].compress).toBeGreaterThanOrEqual(0.5);
    expect(jpegCall[2].compress).toBeLessThanOrEqual(0.6);
  });

  it('honours an explicit JPEG fallback decision (webpSupported=false)', async () => {
    mockEncode(() => Promise.resolve({ uri: 'file:///tmp/upload.jpg' }));

    const result = await optimizeImageAdaptive('file:///tmp/source.jpg', FALLBACK_JPEG_DECISION);

    expect(result.uploadUri).toMatch(/\.jpg$/);
    const jpegCall = mockEncodeCalls.find((call) => call[2].format === 'jpeg');
    expect(jpegCall).toBeDefined();
    if (!jpegCall) throw new Error('expected a JPEG context encode');
    expect(jpegCall[1]).toEqual([{ resize: { width: 1024 } }]);
    expect(jpegCall[2]).toEqual(expect.objectContaining({ format: 'jpeg' }));
  });

  it('emits a localDerivative (1280 WebP q~0.70) when the decision requests one', async () => {
    mockEncode((encode) => {
      const width = encode[1][0]?.resize.width;
      return Promise.resolve({
        uri: width === 1280 ? 'file:///tmp/derivative.webp' : 'file:///tmp/upload.webp',
      });
    });

    const result = await optimizeImageAdaptive('file:///tmp/source.jpg', EDGE_DECISION);

    expect(result.uploadUri).toMatch(/\.webp$/);
    expect(result.localDerivativeUri).toBeDefined();
    expect(result.localDerivativeUri).toMatch(/\.webp$/);

    const derivativeCall = mockEncodeCalls.find((call) => call[1][0]?.resize.width === 1280);
    expect(derivativeCall).toBeDefined();
    if (!derivativeCall) throw new Error('expected a 1280px localDerivative context encode');
    expect(derivativeCall[2].format).toBe('webp');
    expect(derivativeCall[2].compress).toBeGreaterThanOrEqual(0.65);
    expect(derivativeCall[2].compress).toBeLessThanOrEqual(0.75);
  });

  it('does not emit a localDerivative when the decision omits one', async () => {
    mockEncode(() => Promise.resolve({ uri: 'file:///tmp/upload.jpg' }));

    const result = await optimizeImageAdaptive('file:///tmp/source.jpg', FALLBACK_JPEG_DECISION);

    expect(result.localDerivativeUri).toBeUndefined();
  });
});
