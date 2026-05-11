import { escapeHtml } from '../escape-html';
import { renderEmailLayout } from './layout';

/**
 *
 */
export interface SupportContactEmailInput {
  name: string;
  email: string;
  message: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

const renderFieldRow = (label: string, value: string): string => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#0F172A;letter-spacing:0.04em;text-transform:uppercase;width:140px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#334155;word-break:break-word;">${value}</td>
    </tr>
  `;

/** Build the HTML body for the internal support-contact notification email. */
export function buildSupportContactEmail(input: SupportContactEmailInput): string {
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeMessage = escapeHtml(input.message).replaceAll('\n', '<br/>');
  const safeIp = escapeHtml(input.ip ?? 'unknown');
  const safeRequestId = escapeHtml(input.requestId ?? 'n/a');
  const safeUserAgent = escapeHtml(input.userAgent ?? 'unknown');

  const bodyHtml = `
    <p style="margin:0 0 20px 0;color:#334155;">A new contact request just landed in the public support form.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px 20px;margin:0 0 24px 0;">
      ${renderFieldRow('Name', safeName)}
      ${renderFieldRow('Email', `<a href="mailto:${safeEmail}" style="color:#1D4ED8;text-decoration:underline;">${safeEmail}</a>`)}
      ${renderFieldRow('Request ID', `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#475569;">${safeRequestId}</code>`)}
      ${renderFieldRow('IP', `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#475569;">${safeIp}</code>`)}
      ${renderFieldRow('User-Agent', `<span style="font-size:12px;color:#64748B;line-height:1.5;">${safeUserAgent}</span>`)}
    </table>
    <div style="font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#0F172A;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;">Message</div>
    <div style="background-color:#FFFFFF;border-left:3px solid #C49A3C;padding:14px 18px;border-radius:0 8px 8px 0;font-size:15px;line-height:1.65;color:#0F172A;">
      ${safeMessage}
    </div>
  `;

  return renderEmailLayout({
    heading: 'New support contact',
    bodyHtml,
    preheader: `${safeName} via the public contact form`,
    locale: 'en',
    footerNote: 'Internal notification — do not forward outside the support team.',
  });
}
