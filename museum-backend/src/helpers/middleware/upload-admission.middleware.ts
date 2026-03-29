import type { Request, Response, NextFunction } from 'express';

/**
 * Limits the number of concurrent multipart uploads to prevent memory exhaustion.
 * Returns 503 if the limit is exceeded.
 *
 * Only `res.on('close')` is used for decrement — it fires for both normal
 * completion and aborted connections, avoiding double-decrement bugs.
 */
export function createUploadAdmissionMiddleware(maxConcurrent = 50) {
  let inFlight = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      next();
      return;
    }

    if (inFlight >= maxConcurrent) {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Too many concurrent uploads. Please try again shortly.',
        },
      });
      return;
    }

    inFlight++;
    res.on('close', () => {
      inFlight = Math.max(0, inFlight - 1);
    });
    next();
  };
}
