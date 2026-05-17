import { renderEmailLayout } from './layout';

export interface ResetPasswordEmailInput {
  resetUrl: string;
  locale?: 'fr' | 'en';
}

const COPY: Record<
  'fr' | 'en',
  {
    heading: string;
    preheader: string;
    lead: string;
    expires: string;
    ignored: string;
    cta: string;
    footerNote: string;
  }
> = {
  fr: {
    heading: 'Réinitialisation du mot de passe',
    preheader: 'Choisissez un nouveau mot de passe Musaium en un clic.',
    lead: 'Vous avez demandé à réinitialiser votre mot de passe Musaium. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
    expires: 'Ce lien est valable 1 heure pour des raisons de sécurité.',
    ignored:
      "Si vous n'avez pas fait cette demande, vous pouvez ignorer ce message — votre mot de passe restera inchangé.",
    cta: 'Réinitialiser mon mot de passe',
    footerNote:
      "Vous recevez cet email parce qu'une réinitialisation a été demandée pour ce compte.",
  },
  en: {
    heading: 'Reset your password',
    preheader: 'Choose a new Musaium password in one click.',
    lead: 'You requested a password reset for your Musaium account. Click the button below to choose a new one.',
    expires: 'This link is valid for 1 hour for security reasons.',
    ignored:
      'If you did not request this, you can safely ignore this email — your password will stay unchanged.',
    cta: 'Reset my password',
    footerNote:
      'You are receiving this email because a password reset was requested for this account.',
  },
};

export function buildResetPasswordEmail(input: ResetPasswordEmailInput): string {
  const locale = input.locale ?? 'en';
  const copy = COPY[locale];

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${copy.lead}</p>
    <p style="margin:0 0 16px 0;color:#475569;">${copy.expires}</p>
    <p style="margin:0;color:#64748B;font-size:14px;line-height:1.6;">${copy.ignored}</p>
  `;

  return renderEmailLayout({
    heading: copy.heading,
    bodyHtml,
    ctaLabel: copy.cta,
    ctaUrl: input.resetUrl,
    fallbackUrl: input.resetUrl,
    preheader: copy.preheader,
    locale,
    footerNote: copy.footerNote,
  });
}
