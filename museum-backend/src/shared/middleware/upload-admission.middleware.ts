import type { Request, Response, NextFunction } from 'express';

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
