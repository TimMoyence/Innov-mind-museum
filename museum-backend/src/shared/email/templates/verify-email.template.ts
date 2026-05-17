import { renderEmailLayout } from './layout';

export interface VerifyEmailInput {
  verifyUrl: string;
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
  }
> = {
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
    ctaUrl: input.verifyUrl,
    fallbackUrl: input.verifyUrl,
    preheader: copy.preheader,
    locale,
  });
}
