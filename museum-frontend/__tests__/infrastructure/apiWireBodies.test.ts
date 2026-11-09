const mockHttpRequest = jest.fn();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) => mockHttpRequest(...args),
}));

import { authService } from '@/features/auth/infrastructure/authApi';
import {
  reportMessage,
  setMessageFeedback,
  setSessionContext,
} from '@/features/chat/infrastructure/chatApi/metadata';
import { createSession } from '@/features/chat/infrastructure/chatApi/send';
import { reviewApi } from '@/features/review/infrastructure/reviewApi';
import { memoryPreferenceApi } from '@/features/settings/infrastructure/memoryPreferenceApi';
import {
  saveProfilePreferences,
  userProfileApi,
} from '@/features/settings/infrastructure/userProfileApi';
import { ticketApi } from '@/features/support/infrastructure/ticketApi';

const sent = (path: string) => mockHttpRequest.mock.calls.find(([url]) => url === path)?.[1];

describe('Requêtes envoyées — le corps JSON part identique sur le fil', () => {
  beforeEach(() => {
    mockHttpRequest.mockReset();
    mockHttpRequest.mockResolvedValue({});
  });

  it('REFACTOR-2026-11-09 · connexion : corps sérialisé, sans jeton', async () => {
    await authService.login('user@test.com', 'secret123').catch(() => undefined);

    expect(sent('/api/auth/login')).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: '{"email":"user@test.com","password":"secret123"}',
        requiresAuth: false,
      }),
    );
  });

  it('REFACTOR-2026-11-09 · changement de mot de passe : corps sérialisé, avec jeton', async () => {
    await authService.changePassword('old-pass', 'new-pass').catch(() => undefined);

    const options = sent('/api/auth/change-password') as { body: string; requiresAuth?: boolean };
    expect(options.body).toBe('{"currentPassword":"old-pass","newPassword":"new-pass"}');
    expect(options.requiresAuth).not.toBe(false);
  });

  it('REFACTOR-2026-11-09 · réponse à un ticket, préférence mémoire, nouvelle session', async () => {
    await ticketApi.addTicketMessage('t-1', 'Merci').catch(() => undefined);
    await memoryPreferenceApi.update(false).catch(() => undefined);
    await createSession({ locale: 'fr' }).catch(() => undefined);

    expect(sent('/api/support/tickets/t-1/messages')).toEqual(
      expect.objectContaining({ method: 'POST', body: '{"text":"Merci"}' }),
    );
    expect(sent('/api/chat/memory/preference')).toEqual(
      expect.objectContaining({ method: 'PATCH', body: '{"enabled":false}' }),
    );
    expect(sent('/api/chat/sessions')).toEqual(
      expect.objectContaining({ method: 'POST', body: '{"locale":"fr"}' }),
    );
  });

  it.each([
    [
      'inscription',
      () => authService.register({ email: 'a@b.fr', password: 'p', firstname: 'A' } as never),
      '/api/auth/register',
      '{"email":"a@b.fr","password":"p","firstname":"A"}',
    ],
    [
      'rafraîchissement',
      () => authService.refresh('rt'),
      '/api/auth/refresh',
      '{"refreshToken":"rt"}',
    ],
    ['déconnexion sans jeton', () => authService.logout(null), '/api/auth/logout', '{}'],
    [
      'connexion sociale',
      () => authService.socialLogin('google', 'id-token', 'n-1'),
      '/api/auth/social-login',
      '{"provider":"google","idToken":"id-token","nonce":"n-1"}',
    ],
    [
      'code social',
      () => authService.redeemSocialCode('c-1'),
      '/api/auth/social-redeem',
      '{"code":"c-1"}',
    ],
    [
      'mot de passe oublié',
      () => authService.forgotPassword('a@b.fr'),
      '/api/auth/forgot-password',
      '{"email":"a@b.fr"}',
    ],
    [
      'vérification',
      () => authService.verifyEmail('tk'),
      '/api/auth/verify-email',
      '{"token":"tk"}',
    ],
    [
      'réinitialisation',
      () => authService.resetPassword('tk', 'np'),
      '/api/auth/reset-password',
      '{"token":"tk","newPassword":"np"}',
    ],
    [
      'changement d’e-mail',
      () => authService.changeEmail('n@b.fr', 'cp'),
      '/api/auth/change-email',
      '{"newEmail":"n@b.fr","currentPassword":"cp"}',
    ],
    [
      'confirmation d’e-mail',
      () => authService.confirmEmailChange('tk'),
      '/api/auth/confirm-email-change',
      '{"token":"tk"}',
    ],
    [
      'voix de lecture',
      () => authService.updateTtsVoice(null),
      '/api/auth/tts-voice',
      '{"voice":null}',
    ],
    [
      'signalement',
      () => reportMessage({ messageId: 'm-1', reason: 'inaccurate' }),
      '/api/chat/messages/m-1/report',
      '{"reason":"inaccurate"}',
    ],
    [
      'avis sur un message',
      () => setMessageFeedback('m-1', 'positive'),
      '/api/chat/messages/m-1/feedback',
      '{"value":"positive"}',
    ],
    [
      'contexte de session',
      () => setSessionContext({ sessionId: 's-1', currentRoom: null }),
      '/api/chat/sessions/s-1/context',
      '{"currentRoom":null}',
    ],
    [
      'avis',
      () => reviewApi.submitReview(9, 'Bien'),
      '/api/reviews',
      '{"rating":9,"comment":"Bien"}',
    ],
    [
      'nouveau ticket',
      () => ticketApi.createTicket({ subject: 'S', description: 'D', priority: 'high' }),
      '/api/support/tickets',
      '{"subject":"S","description":"D","priority":"high"}',
    ],
    [
      'préférences du compte',
      () => saveProfilePreferences({ guideLevel: 'expert' }),
      '/api/auth/me/preferences',
      '{"guideLevel":"expert"}',
    ],
    [
      'préférences de contenu',
      () => userProfileApi.updateContentPreferences(['history']),
      '/api/auth/content-preferences',
      '{"preferences":["history"]}',
    ],
  ] as const)(
    'REFACTOR-2026-11-09 · %s : la requête part identique',
    async (_label, call, path, body) => {
      await Promise.resolve(call()).catch(() => undefined);

      expect(sent(path)).toEqual(expect.objectContaining({ body }));
      expect(sent(path)).toMatchSnapshot();
    },
  );
});
