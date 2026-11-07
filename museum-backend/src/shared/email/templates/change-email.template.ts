import { renderLinkEmail, type LinkEmailCopy } from './link-email';

import type { EmailLocale } from '@shared/email/email-locale';

export interface ChangeEmailEmailInput {
  confirmUrl: string;
  locale?: EmailLocale;
}

const COPY: Record<EmailLocale, LinkEmailCopy> = {
  fr: {
    heading: "Changement d'adresse email",
    preheader: 'Confirmez votre nouvelle adresse email Musaium.',
    lead: "Vous avez demandé à changer l'adresse email de votre compte Musaium. Confirmez en cliquant sur le bouton ci-dessous.",
    expires: 'Ce lien est valable 1 heure pour des raisons de sécurité.',
    ignored:
      "Si vous n'avez pas demandé ce changement, ignorez ce message — votre adresse email actuelle restera inchangée.",
    cta: 'Confirmer ma nouvelle adresse',
    footerNote:
      "Vous recevez cet email parce qu'un changement d'adresse a été demandé sur ce compte.",
  },
  en: {
    heading: 'Email address change',
    preheader: 'Confirm your new Musaium email address.',
    lead: 'You requested to change the email address of your Musaium account. Confirm by clicking the button below.',
    expires: 'This link is valid for 1 hour for security reasons.',
    ignored:
      'If you did not request this change, ignore this email — your current address will stay unchanged.',
    cta: 'Confirm my new email',
    footerNote:
      'You are receiving this email because an address change was requested on this account.',
  },
};

export function buildChangeEmailEmail(input: ChangeEmailEmailInput): string {
  return renderLinkEmail(COPY, input.confirmUrl, input.locale);
}
