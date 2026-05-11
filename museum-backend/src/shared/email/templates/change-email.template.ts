import { renderEmailLayout } from './layout';

/**
 *
 */
export interface ChangeEmailEmailInput {
  confirmUrl: string;
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

/** Build the HTML body for the email-change confirmation email sent to the new address. */
export function buildChangeEmailEmail(input: ChangeEmailEmailInput): string {
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
    ctaUrl: input.confirmUrl,
    fallbackUrl: input.confirmUrl,
    preheader: copy.preheader,
    locale,
    footerNote: copy.footerNote,
  });
}
