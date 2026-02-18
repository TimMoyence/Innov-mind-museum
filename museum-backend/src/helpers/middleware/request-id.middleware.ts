import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const inbound = req.header(REQUEST_ID_HEADER);
  const requestId = inbound && inbound.trim().length ? inbound : randomUUID();

  (req as { requestId?: string }).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};
