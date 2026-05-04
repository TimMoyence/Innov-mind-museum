jest.mock('@src/config/env', () => ({
  env: {
    llm: { timeoutMs: 5000 },
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  startSpan: jest.fn((_ctx: unknown, cb: (span: unknown) => unknown) => cb({})),
}));

// Mock tesseract.js — dynamic import inside TesseractOcrService.getScheduler()
const mockAddJob = jest.fn();
const mockTerminate = jest.fn();
const mockScheduler = {
  addWorker: jest.fn(),
  addJob: mockAddJob,
  terminate: mockTerminate,
};

jest.mock('tesseract.js', () => ({
  createScheduler: () => mockScheduler,
  createWorker: () => Promise.resolve({}),
}));

import { AppError } from '@shared/errors/app.error';
import {
  TesseractOcrService,
  DisabledOcrService,
} from '@modules/chat/adapters/secondary/image/ocr-service';

describe('TesseractOcrService', () => {
  let service: TesseractOcrService;

  beforeEach(() => {
    service = new TesseractOcrService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.destroy();
  });

  it('returns text and confidence on successful extraction', async () => {
    mockAddJob.mockResolvedValue({
      data: { text: '  The Starry Night  ', confidence: 92 },
    });

    const result = await service.extractText('dGVzdA==');

    expect(result).toEqual({
      text: 'The Starry Night',
      confidence: 0.92,
    });
    expect(mockAddJob).toHaveBeenCalledWith('recognize', expect.any(Buffer));
  });

  it('returns null when extracted text is empty', async () => {
    mockAddJob.mockResolvedValue({
      data: { text: '   ', confidence: 10 },
    });

    const result = await service.extractText('dGVzdA==');

    expect(result).toBeNull();
  });

  it('returns null when text is undefined', async () => {
    mockAddJob.mockResolvedValue({
      data: { text: undefined, confidence: 0 },
    });

    const result = await service.extractText('dGVzdA==');

    expect(result).toBeNull();
  });

  it('returns null on OCR timeout (fail-open)', async () => {
    mockAddJob.mockImplementation(
      () =>
        new Promise((_resolve) => {
          // never resolves — the timeout will fire
        }),
    );

    // Override timeout to be very short so the test runs fast
    const { env } = require('@src/config/env');
    const originalTimeout = env.llm.timeoutMs;
    env.llm.timeoutMs = 50;

    try {
      const result = await service.extractText('dGVzdA==');
      expect(result).toBeNull();
    } finally {
      env.llm.timeoutMs = originalTimeout;
    }
  });

  it('wraps non-timeout errors as AppError', async () => {
    mockAddJob.mockRejectedValue(new Error('Worker crashed'));

    await expect(service.extractText('dGVzdA==')).rejects.toThrow(AppError);
    await expect(service.extractText('dGVzdA==')).rejects.toMatchObject({
      statusCode: 500,
      code: 'OCR_EXTRACTION_ERROR',
    });
  });

  it('destroy terminates the scheduler', async () => {
    // Trigger scheduler init first
    mockAddJob.mockResolvedValue({ data: { text: 'test', confidence: 80 } });
    await service.extractText('dGVzdA==');

    await service.destroy();
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('destroy is safe to call when scheduler was never initialized', async () => {
    // No extractText call => schedulerPromise is null
    await expect(service.destroy()).resolves.toBeUndefined();
  });
});

describe('DisabledOcrService', () => {
  it('returns null immediately', async () => {
    const disabled = new DisabledOcrService();
    const result = await disabled.extractText();
    expect(result).toBeNull();
  });
});
