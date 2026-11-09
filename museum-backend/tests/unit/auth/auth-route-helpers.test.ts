import { pickEmailLocale } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';

import type { Request } from 'express';

const makeReq = (overrides: {
  body?: Record<string, unknown>;
  acceptLanguage?: string;
}): Request => {
  const headers: Record<string, string> = {};
  if (overrides.acceptLanguage !== undefined) {
    headers['accept-language'] = overrides.acceptLanguage;
  }
  const base: Partial<Request> = {
    body: overrides.body ?? {},
    headers,
  };
  return base as unknown as Request;
};

describe('pickEmailLocale — body.locale priority then Accept-Language', () => {
  describe('region-tag normalisation of body.locale', () => {
    it('returns "en" for body.locale "en-US" with no Accept-Language header', () => {
      const req = makeReq({ body: { locale: 'en-US' } });
      expect(pickEmailLocale(req)).toBe('en');
    });

    it('returns "en" for body.locale "en-US" even when Accept-Language is French', () => {
      const req = makeReq({ body: { locale: 'en-US' }, acceptLanguage: 'fr-FR,fr;q=0.9' });
      expect(pickEmailLocale(req)).toBe('en');
    });

    it('returns "en" for body.locale "en-GB" with no Accept-Language header', () => {
      const req = makeReq({ body: { locale: 'en-GB' } });
      expect(pickEmailLocale(req)).toBe('en');
    });

    it('returns "fr" for body.locale "fr-FR" with no Accept-Language header', () => {
      const req = makeReq({ body: { locale: 'fr-FR' } });
      expect(pickEmailLocale(req)).toBe('fr');
    });
  });

  describe('non-regression', () => {
    it('returns "en" for exact body.locale "en"', () => {
      const req = makeReq({ body: { locale: 'en' } });
      expect(pickEmailLocale(req)).toBe('en');
    });

    it('returns "fr" for exact body.locale "fr"', () => {
      const req = makeReq({ body: { locale: 'fr' } });
      expect(pickEmailLocale(req)).toBe('fr');
    });

    it('falls through to Accept-Language for non-fr/en body.locale "es" (en header wins)', () => {
      const req = makeReq({ body: { locale: 'es' }, acceptLanguage: 'en-US,en;q=0.9' });
      expect(pickEmailLocale(req)).toBe('en');
    });

    it('falls through to Accept-Language for non-fr/en body.locale "es" (no header → default fr)', () => {
      const req = makeReq({ body: { locale: 'es' } });
      expect(pickEmailLocale(req)).toBe('fr');
    });

    it('uses Accept-Language when no body.locale is present (en header)', () => {
      const req = makeReq({ body: {}, acceptLanguage: 'en-US,en;q=0.9' });
      expect(pickEmailLocale(req)).toBe('en');
    });

    it('defaults to "fr" when no body.locale and no Accept-Language', () => {
      const req = makeReq({ body: {} });
      expect(pickEmailLocale(req)).toBe('fr');
    });
  });
});
