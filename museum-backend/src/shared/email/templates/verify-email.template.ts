import { renderLinkEmail, type LinkEmailCopy } from './link-email';

import type { EmailLocale } from '@shared/email/email-locale';

export interface VerifyEmailInput {
  verifyUrl: string;
  locale?: EmailLocale;
}

const COPY: Record<EmailLocale, LinkEmailCopy> = {
  fr: {
    heading: 'Bienvenue sur Musaium',
    preheader: 'Confirmez votre email pour activer votre compagnon de musée.',
    lead: 'Confirmez votre adresse email pour activer votre compte et reprendre vos visites quand vous le souhaitez.',
    expires: 'Ce lien expire dans 24 heures.',
    ignored:
      "Si vous n'avez pas créé de compte Musaium, vous pouvez ignorer ce message en toute tranquillité.",
    cta: 'Vérifier mon email',
  },
  en: {
    heading: 'Welcome to Musaium',
    preheader: 'Confirm your email to activate your museum companion.',
    lead: 'Confirm your email address to activate your account and resume your visits whenever you want.',
    expires: 'This link expires in 24 hours.',
    ignored: 'If you did not create a Musaium account, you can safely ignore this email.',
    cta: 'Verify my email',
  },
};

export function buildVerifyEmail(input: VerifyEmailInput): string {
  return renderLinkEmail(COPY, input.verifyUrl, input.locale);
}
