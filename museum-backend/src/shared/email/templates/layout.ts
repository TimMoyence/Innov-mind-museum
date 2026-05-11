/**
 * Musaium email layout — single source of truth for the email charte graphique.
 *
 * Mirrors the mobile app design language (`museum-frontend/shared/ui/`) :
 * - Pastel header gradient (matches `lightTheme.pageGradient` in `themes.ts`).
 * - Hosted logo image (`<FRONTEND_URL>/images/logo.png`, mirror of
 *   `museum-frontend/assets/images/logo.png`).
 * - Brand voice strings imported from the same i18n keys used in mobile copy
 *   (translation.json `welcome.subtitle`, `home.hero_title`, etc.).
 *
 * Design constraints (NOT mobile but emails-specific):
 * - Table-based layout (Outlook desktop = Word render engine, requires tables).
 * - Inline CSS only, except a single `<style>` block in `<head>` for `@media`
 *   queries (mobile breakpoint) and Outlook fallbacks.
 * - Bulletproof CTA: VML mso conditional for Outlook + standard `<a>` for the rest.
 * - No backdrop-filter / glass effects (not supported by ANY email client).
 *
 * Color values MIRROR `design-system/tokens/colors.ts` (primary600 used for CTA
 * because that's what mobile `lightTheme.primary` resolves to). Hard-coded
 * here because the design-system package is not consumed at backend runtime.
 * The unit test `tests/unit/shared/email/templates/palette-mirror.test.ts`
 * guards against drift.
 */

const PALETTE = {
  brandPrimary: '#1D4ED8', // primary600 — matches mobile lightTheme.primary
  brandPrimaryDark: '#1E40AF', // primary700 — gradient end + hover
  brandAccent: '#0EA5E9', // accent500
  brandGold: '#C49A3C', // gold500 — cultural highlight
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  surfaceDefault: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  borderSubtle: '#E2E8F0',
  // Pastel gradient stops mirroring lightTheme.pageGradient
  // [primaryScale.50, primaryScale.100, gradient.lightEnd]
  gradientStart: '#EAF2FF', // primary50
  gradientMid: '#D8E8FF', // primary100
  gradientEnd: '#D5F0FF', // gradient.lightEnd
} as const;

const FONT_STACK = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const DEFAULT_LOGO_URL = 'https://musaium.com/images/logo.png';

/** Input shape for {@link renderEmailLayout}. */
export interface EmailLayoutInput {
  /** Heading shown at top of body card. Static or pre-escaped. */
  heading: string;
  /** HTML for the message body (paragraphs, blockquote, etc.). Pre-escaped where user data is involved. */
  bodyHtml: string;
  /** Optional CTA button label. */
  ctaLabel?: string;
  /** Optional CTA target URL (server-built, no escaping needed for href). */
  ctaUrl?: string;
  /** Plaintext fallback URL displayed under the CTA for clients that block buttons. Defaults to ctaUrl. */
  fallbackUrl?: string;
  /** Hidden inbox preview snippet. Plain text only, ≤120 chars. */
  preheader?: string;
  /** Locale used for the html lang attribute and footer copy. */
  locale?: 'fr' | 'en';
  /** Optional context line in the footer ("Why am I receiving this?"). */
  footerNote?: string;
  /** Override the hosted logo URL. Defaults to `<FRONTEND_URL>/images/logo.png`. */
  logoUrl?: string;
}

const FOOTER_COPY: Record<'fr' | 'en', { tagline: string; legal: string; sentBy: string }> = {
  fr: {
    tagline: 'Votre compagnon de musée personnel',
    legal:
      '© Musaium 2026. Cet email vous a été envoyé automatiquement, merci de ne pas y répondre.',
    sentBy: 'Envoyé par Musaium',
  },
  en: {
    tagline: 'Your museum companion',
    legal: '© Musaium 2026. This email was sent automatically — please do not reply.',
    sentBy: 'Sent by Musaium',
  },
};

const FALLBACK_PROMPT: Record<'fr' | 'en', string> = {
  fr: 'Bouton non visible ? Copiez ce lien :',
  en: 'Button not showing? Copy this link:',
};

/**
 * Compute the hosted logo URL.
 * Priority: explicit `logoUrl` arg > env `FRONTEND_URL` > musaium.com default.
 */
const resolveLogoUrl = (override: string | undefined): string => {
  if (override) return override;
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl && frontendUrl.trim().length > 0) {
    return `${frontendUrl.replace(/\/$/, '')}/images/logo.png`;
  }
  return DEFAULT_LOGO_URL;
};

const renderHeadStyle = (): string => `
    <style type="text/css">
      body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      table { border-collapse:collapse !important; mso-table-lspace:0; mso-table-rspace:0; }
      img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
      a { text-decoration:none; }
      a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
      @media screen and (max-width: 600px) {
        .musaium-card { width:100% !important; max-width:100% !important; border-radius:0 !important; }
        .musaium-card-inner { padding:28px 22px !important; }
        .musaium-band-inner { padding:32px 22px 28px 22px !important; }
        .musaium-logo { width:72px !important; height:72px !important; }
        .musaium-tagline { font-size:13px !important; }
        .musaium-heading { font-size:22px !important; line-height:1.3 !important; }
        .musaium-body-text { font-size:15px !important; line-height:1.65 !important; }
      }
    </style>`;

const renderCtaBlock = (
  ctaLabel: string,
  ctaUrl: string,
  fallbackUrl: string,
  fallbackPrompt: string,
): string => `
              <tr>
                <td align="center" style="padding:8px 0 4px 0;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="16%" stroke="f" fillcolor="${PALETTE.brandPrimary}">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:600;">${ctaLabel}</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-- -->
                  <a href="${ctaUrl}"
                     style="display:inline-block;background-color:${PALETTE.brandPrimary};background-image:linear-gradient(135deg,${PALETTE.brandPrimary} 0%,${PALETTE.brandPrimaryDark} 100%);color:#ffffff;text-decoration:none;font-family:${FONT_STACK};font-size:16px;font-weight:600;line-height:48px;padding:0 32px;border-radius:10px;letter-spacing:0.01em;mso-hide:all;">
                    ${ctaLabel}
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:18px 0 0 0;font-family:${FONT_STACK};font-size:13px;color:${PALETTE.textMuted};line-height:1.5;">
                  ${fallbackPrompt}<br/>
                  <a href="${fallbackUrl}" style="color:${PALETTE.brandPrimary};word-break:break-all;text-decoration:underline;">${fallbackUrl}</a>
                </td>
              </tr>`;

const renderFooterNote = (note: string): string => `
              <tr>
                <td align="center" style="padding:0 0 14px 0;font-family:${FONT_STACK};font-size:12px;color:${PALETTE.textMuted};line-height:1.55;">
                  ${note}
                </td>
              </tr>`;

const renderHead = (): string => `  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Musaium</title>
    <!--[if mso]>
    <noscript>
      <xml>
        <o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
    <![endif]-->
    ${renderHeadStyle()}
  </head>`;

const renderHeaderBand = (logoUrl: string, tagline: string): string => `
            <tr>
              <td class="musaium-band-inner" align="center" style="background-color:${PALETTE.gradientMid};background-image:linear-gradient(160deg,${PALETTE.gradientStart} 0%,${PALETTE.gradientMid} 50%,${PALETTE.gradientEnd} 100%);padding:40px 32px 32px 32px;">
                <img src="${logoUrl}" alt="Musaium" width="88" height="88" class="musaium-logo" style="width:88px;height:88px;border-radius:18px;display:block;margin:0 auto;" />
                <div class="musaium-tagline" style="font-family:${FONT_STACK};font-size:14px;font-weight:500;letter-spacing:0.04em;color:${PALETTE.textSecondary};margin-top:18px;">${tagline}</div>
              </td>
            </tr>`;

const renderBodyCard = (heading: string, bodyHtml: string, ctaTable: string): string => `
            <tr>
              <td class="musaium-card-inner" style="padding:40px 40px 32px 40px;">
                <h1 class="musaium-heading" style="margin:0 0 20px 0;font-family:${FONT_STACK};font-size:24px;line-height:1.3;font-weight:600;color:${PALETTE.textPrimary};letter-spacing:-0.01em;">${heading}</h1>
                <div class="musaium-body-text" style="font-family:${FONT_STACK};font-size:16px;line-height:1.7;color:${PALETTE.textSecondary};">
                  ${bodyHtml}
                </div>
                ${ctaTable}
              </td>
            </tr>`;

const renderFooterCard = (
  footerCopy: { tagline: string; legal: string; sentBy: string },
  footerNoteBlock: string,
): string => `
            <tr>
              <td style="padding:0 40px 0 40px;">
                <div style="height:1px;line-height:1px;background-color:${PALETTE.borderSubtle};font-size:0;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px 40px;background-color:${PALETTE.surfaceElevated};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${footerNoteBlock}
                  <tr>
                    <td align="center" style="padding:0 0 6px 0;font-family:${FONT_STACK};font-size:13px;font-weight:500;color:${PALETTE.textSecondary};letter-spacing:0.01em;">${footerCopy.tagline}</td>
                  </tr>
                  <tr>
                    <td align="center" style="font-family:${FONT_STACK};font-size:11px;color:${PALETTE.textMuted};line-height:1.55;">${footerCopy.legal}</td>
                  </tr>
                </table>
              </td>
            </tr>`;

const renderOuterFooter = (sentBy: string): string => `
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
            <tr>
              <td align="center" style="padding:18px 16px 0 16px;font-family:${FONT_STACK};font-size:11px;color:${PALETTE.textMuted};letter-spacing:0.04em;">
                ${sentBy} · no-reply@musaium.com
              </td>
            </tr>
          </table>`;

const buildCtaTable = (
  ctaLabel: string | undefined,
  ctaUrl: string | undefined,
  fallbackUrl: string,
  fallbackPrompt: string,
): string => {
  if (!ctaLabel || !ctaUrl) return '';
  const inner = renderCtaBlock(ctaLabel, ctaUrl, fallbackUrl, fallbackPrompt);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">${inner}</table>`;
};

/**
 * Render the full HTML document for an email built on the Musaium charte.
 * Combines pastel header band with hosted logo, body card with optional CTA,
 * and footer with brand mention.
 */
export function renderEmailLayout(input: EmailLayoutInput): string {
  const locale = input.locale ?? 'en';
  const footer = FOOTER_COPY[locale];
  const fallbackPrompt = FALLBACK_PROMPT[locale];
  const preheader = input.preheader ?? '';
  const logoUrl = resolveLogoUrl(input.logoUrl);
  const fallbackUrl = input.fallbackUrl ?? input.ctaUrl ?? '';
  const ctaTable = buildCtaTable(input.ctaLabel, input.ctaUrl, fallbackUrl, fallbackPrompt);
  const footerNoteBlock = input.footerNote ? renderFooterNote(input.footerNote) : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${locale}">
${renderHead()}
  <body style="margin:0;padding:0;width:100%;background-color:${PALETTE.surfaceMuted};font-family:${FONT_STACK};">
    <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PALETTE.surfaceMuted};max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PALETTE.surfaceMuted};">
      <tr>
        <td align="center" style="padding:32px 16px 32px 16px;">
          <table role="presentation" class="musaium-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${PALETTE.surfaceDefault};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">${renderHeaderBand(logoUrl, footer.tagline)}${renderBodyCard(input.heading, input.bodyHtml, ctaTable)}${renderFooterCard(footer, footerNoteBlock)}
          </table>${renderOuterFooter(footer.sentBy)}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const __palette = PALETTE;
export const __fontStack = FONT_STACK;
