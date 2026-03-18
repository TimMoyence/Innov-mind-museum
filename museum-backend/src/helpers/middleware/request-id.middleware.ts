import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

/** Extracts or generates a unique request ID from the x-request-id header and attaches it to the request and response. */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const inbound = req.header(REQUEST_ID_HEADER);
  const requestId = inbound && inbound.trim().length ? inbound : randomUUID();

  (req as { requestId?: string }).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};
