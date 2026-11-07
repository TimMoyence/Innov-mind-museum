import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const { app } = createRouteTestApp();

const PUBLIC_FORMS: [string, number][] = [
  ['/api/auth/register', 5],
  ['/api/auth/login', 10],
  ['/api/auth/forgot-password', 5],
  ['/api/auth/reset-password', 5],
  ['/api/auth/verify-email', 10],
  ['/api/auth/confirm-email-change', 10],
  ['/api/support/contact', 5],
  ['/api/telemetry/funnel', 60],
];

const VISITOR_EMAIL = 'visiteur@musaium.test';

const COUNTED_FORMS: [string, number, object][] = [
  ['/api/auth/login', 10, { email: VISITOR_EMAIL, password: 'mauvais-mot-de-passe' }],
  ['/api/auth/forgot-password', 5, { email: VISITOR_EMAIL }],
  [
    '/api/support/contact',
    5,
    { name: 'Visiteur', email: VISITOR_EMAIL, message: 'Une question sur la visite.' },
  ],
];

describe('une demande refusée pour formulaire invalide ne consomme aucune limite', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it.each(PUBLIC_FORMS)(
    'QUOTA · %s refuse en 400 chaque formulaire invalide, même au-delà de sa limite de %i',
    async (path, limit) => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt <= limit; attempt += 1) {
        const res = await request(app)
          .post(path)
          .set('x-musaium-analytics-consent', 'granted')
          .send({});
        statuses.push(res.status);
      }

      expect(statuses).toEqual(Array.from({ length: limit + 1 }, () => 400));
    },
  );

  it.each(COUNTED_FORMS)(
    'QUOTA · %s, limite de %i épuisée par des envois bien formés, montre encore l’erreur du formulaire invalide',
    async (path, limit, wellFormedBody) => {
      for (let attempt = 0; attempt < limit; attempt += 1) {
        await request(app).post(path).send(wellFormedBody);
      }
      const capped = await request(app).post(path).send(wellFormedBody);

      const res = await request(app).post(path).send({});

      expect(capped.status).toBe(429);
      expect(res.status).toBe(400);
    },
  );
});
