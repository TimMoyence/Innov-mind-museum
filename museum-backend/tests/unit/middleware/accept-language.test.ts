import type { Request, Response, NextFunction } from 'express';
import { acceptLanguageMiddleware } from '@src/helpers/middleware/accept-language.middleware';
import { makePartialRequest } from '../../helpers/http/express-mock.helpers';

const mockReq = (headers: Record<string, string | string[] | undefined> = {}): Request =>
  makePartialRequest({ headers });

const mockRes = (): Partial<Response> => ({});

describe('acceptLanguageMiddleware', () => {
  it('sets clientLocale from Accept-Language header', () => {
    const req = mockReq({ 'accept-language': 'fr-FR,en;q=0.9' });
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBe('fr-FR');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets clientLocale to undefined when header is missing', () => {
    const req = mockReq({});
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles bare language code', () => {
    const req = mockReq({ 'accept-language': 'de' });
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBe('de');
  });

  it('extracts first preference from complex header', () => {
    const req = mockReq({ 'accept-language': 'ja, en-US;q=0.9, fr;q=0.8' });
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    expect(req.clientLocale).toBe('ja');
  });

  it('handles array-valued accept-language header', () => {
    // Some proxies may send headers as arrays
    const req = mockReq({ 'accept-language': ['es-ES', 'en;q=0.5'] });
    const next = jest.fn() as NextFunction;

    acceptLanguageMiddleware(req, mockRes() as Response, next);

    // Should use the first element of the array
    expect(req.clientLocale).toBe('es-ES');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
