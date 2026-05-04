jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@src/config/env', () => ({
  env: {
    upload: {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    llm: {
      maxImageBytes: 10_000_000,
    },
  },
}));

import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { AppError } from '@shared/errors/app.error';

import type { ImageStorage, SaveImageInput } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { PostMessageInput } from '@modules/chat/domain/chat.types';

const makeMockImageStorage = (): jest.Mocked<ImageStorage> => ({
  save: jest.fn().mockResolvedValue('s3://bucket/stored-key'),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

const makeMockOcr = (): jest.Mocked<OcrService> => ({
  extractText: jest.fn().mockResolvedValue(null),
  destroy: jest.fn().mockResolvedValue(undefined),
});

type ImageInput = NonNullable<PostMessageInput['image']>;

describe('ImageProcessingService', () => {
  describe('processImage — URL source', () => {
    it('accepts a safe HTTPS URL and returns it as imageRef', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'url',
        value: 'https://example.com/photo.jpg',
      };

      const result = await service.processImage(image, 'session-1');

      expect(result.imageRef).toBe('https://example.com/photo.jpg');
      expect(result.orchestratorImage).toBe(image);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a non-HTTPS URL', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'url',
        value: 'http://example.com/photo.jpg',
      };

      await expect(service.processImage(image, 'session-1')).rejects.toThrow('safe HTTPS URL');
    });

    it('rejects a URL pointing to a private host', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'url',
        value: 'https://127.0.0.1/photo.jpg',
      };

      await expect(service.processImage(image, 'session-1')).rejects.toThrow('safe HTTPS URL');
    });

    it('rejects a URL pointing to localhost', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'url',
        value: 'https://localhost/photo.jpg',
      };

      await expect(service.processImage(image, 'session-1')).rejects.toThrow('safe HTTPS URL');
    });
  });

  describe('processImage — upload source', () => {
    // Minimum 12 bytes needed for magic byte detection; starts with JPEG signature FF D8 FF
    const validJpegBase64 = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]).toString('base64');

    it('stores the image via ImageStorage and returns the ref', async () => {
      const storage = makeMockImageStorage();
      storage.save.mockResolvedValue('s3://bucket/uploaded.jpg');

      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'upload',
        value: validJpegBase64,
        mimeType: 'image/jpeg',
        sizeBytes: 100,
      };

      const result = await service.processImage(image, 'session-1', 42);

      expect(result.imageRef).toBe('s3://bucket/uploaded.jpg');
      expect(storage.save).toHaveBeenCalledTimes(1);
      const saveArg = storage.save.mock.calls[0][0] as SaveImageInput;
      expect(saveArg.mimeType).toBe('image/jpeg');
    });

    it('rejects upload with missing mimeType', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'upload',
        value: validJpegBase64,
        sizeBytes: 100,
      };

      await expect(service.processImage(image, 'session-1')).rejects.toThrow(
        'mime type is required',
      );
    });

    it('rejects upload with unsupported mimeType', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'upload',
        value: validJpegBase64,
        mimeType: 'image/bmp',
        sizeBytes: 100,
      };

      await expect(service.processImage(image, 'session-1')).rejects.toThrow(
        'Unsupported image mime type',
      );
    });
  });

  describe('processImage — legacy base64 source', () => {
    // 12+ bytes JPEG for magic byte detection
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const jpegBase64 = jpegBytes.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${jpegBase64}`;

    it('decodes data URL, stores, and returns ref', async () => {
      const storage = makeMockImageStorage();
      storage.save.mockResolvedValue('s3://bucket/legacy.jpg');
      const service = new ImageProcessingService({ imageStorage: storage });

      const image: ImageInput = {
        source: 'base64',
        value: dataUrl,
      };

      const result = await service.processImage(image, 'session-1');

      expect(result.imageRef).toBe('s3://bucket/legacy.jpg');
      expect(storage.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('runOcrGuard', () => {
    it('does nothing when OCR service is not configured', async () => {
      const storage = makeMockImageStorage();
      const service = new ImageProcessingService({ imageStorage: storage });

      const evaluateGuardrail = jest.fn();

      await service.runOcrGuard(
        { source: 'upload', value: 'base64data', mimeType: 'image/jpeg' },
        evaluateGuardrail,
        'session-1',
      );

      expect(evaluateGuardrail).not.toHaveBeenCalled();
    });

    it('passes OCR text through the guardrail', async () => {
      const storage = makeMockImageStorage();
      const ocr = makeMockOcr();
      ocr.extractText.mockResolvedValue({ text: 'some artwork text', confidence: 0.9 });

      const service = new ImageProcessingService({ imageStorage: storage, ocr });

      const evaluateGuardrail = jest.fn().mockReturnValue({ allow: true });

      await service.runOcrGuard(
        { source: 'upload', value: 'base64data', mimeType: 'image/jpeg' },
        evaluateGuardrail,
        'session-1',
      );

      expect(evaluateGuardrail).toHaveBeenCalledWith({ text: 'some artwork text' });
    });

    it('throws when OCR text fails the guardrail', async () => {
      const storage = makeMockImageStorage();
      const ocr = makeMockOcr();
      ocr.extractText.mockResolvedValue({ text: 'disallowed content', confidence: 0.95 });

      const service = new ImageProcessingService({ imageStorage: storage, ocr });

      const evaluateGuardrail = jest.fn().mockReturnValue({ allow: false, reason: 'blocked' });

      await expect(
        service.runOcrGuard(
          { source: 'upload', value: 'base64data', mimeType: 'image/jpeg' },
          evaluateGuardrail,
          'session-1',
        ),
      ).rejects.toThrow('disallowed content');
    });

    it('fails open when OCR extraction throws an unexpected error', async () => {
      const storage = makeMockImageStorage();
      const ocr = makeMockOcr();
      ocr.extractText.mockRejectedValue(new Error('OCR engine crashed'));

      const service = new ImageProcessingService({ imageStorage: storage, ocr });

      const evaluateGuardrail = jest.fn();

      // Should NOT throw
      await service.runOcrGuard(
        { source: 'upload', value: 'base64data', mimeType: 'image/jpeg' },
        evaluateGuardrail,
        'session-1',
      );

      expect(evaluateGuardrail).not.toHaveBeenCalled();
    });

    it('re-throws AppError even when OCR itself does not throw', async () => {
      const storage = makeMockImageStorage();
      const ocr = makeMockOcr();
      ocr.extractText.mockResolvedValue({ text: 'bad text', confidence: 0.9 });

      const service = new ImageProcessingService({ imageStorage: storage, ocr });

      const evaluateGuardrail = jest.fn().mockReturnValue({ allow: false });

      await expect(
        service.runOcrGuard(
          { source: 'upload', value: 'base64data', mimeType: 'image/jpeg' },
          evaluateGuardrail,
          'session-1',
        ),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('does nothing when OCR returns null', async () => {
      const storage = makeMockImageStorage();
      const ocr = makeMockOcr();
      ocr.extractText.mockResolvedValue(null);

      const service = new ImageProcessingService({ imageStorage: storage, ocr });

      const evaluateGuardrail = jest.fn();

      await service.runOcrGuard(
        { source: 'upload', value: 'base64data', mimeType: 'image/jpeg' },
        evaluateGuardrail,
        'session-1',
      );

      expect(evaluateGuardrail).not.toHaveBeenCalled();
    });
  });
});
