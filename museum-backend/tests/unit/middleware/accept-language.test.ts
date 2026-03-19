import type { Request, Response, NextFunction } from 'express';
import { acceptLanguageMiddleware } from '@src/helpers/middleware/accept-language.middleware';

const mockReq = (headers: Record<string, string | undefined> = {}): Partial<Request> => ({
  headers: headers as Record<string, string>,
});

const mockRes = (): Partial<Response> => ({});

describe('acceptLanguageMiddleware', () => {
  it('sets clientLocale from Accept-Language header', () => {
    const req = mockReq({ 'accept-language': 'fr-FR,en;q=0.9' }) as Request;
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBe('fr-FR');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets clientLocale to undefined when header is missing', () => {
    const req = mockReq({}) as Request;
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles bare language code', () => {
    const req = mockReq({ 'accept-language': 'de' }) as Request;
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBe('de');
  });

  it('extracts first preference from complex header', () => {
    const req = mockReq({ 'accept-language': 'ja, en-US;q=0.9, fr;q=0.8' }) as Request;
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBe('ja');
  });
});
