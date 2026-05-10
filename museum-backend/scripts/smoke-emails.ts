/* eslint-disable no-console -- CLI smoke script: console output IS the user-facing channel */
import 'dotenv/config';
/**
 * Smoke test for transactional email templates.
 *
 * Sends every variant produced by `src/shared/email/templates/` to a single test
 * recipient via Brevo, so a human can visually validate rendering across email
 * clients (Gmail, Outlook, Apple Mail).
 *
 * Usage:
 *   BREVO_API_KEY=xkeysib-... pnpm smoke:emails
 *   BREVO_API_KEY=xkeysib-... SMOKE_EMAIL_RECIPIENT=foo@bar.com pnpm smoke:emails
 *
 * Exits 0 if every variant was accepted by Brevo, 1 if any failed.
 */

import { BrevoEmailService } from '@shared/email/brevo-email.service';
import {
  buildChangeEmailEmail,
  buildResetPasswordEmail,
  buildReviewModerationEmail,
  buildSupportContactEmail,
  buildVerifyEmail,
} from '@shared/email/templates';

interface Variant {
  kind: string;
  subject: string;
  recipient: string;
  html: string;
}

const DEFAULT_RECIPIENT = 'tim.moyence@outlook.fr';
const SEND_DELAY_MS = 250;
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://musaium.com';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`[smoke-emails] Missing required env: ${name}`);
    console.error('[smoke-emails] Run with BREVO_API_KEY=xkeysib-... pnpm smoke:emails');
    process.exit(1);
  }
  return value.trim();
}

function buildVariants(recipient: string): Variant[] {
  const fakeVerifyToken = 'SMOKE_TOKEN_VERIFY_2026_05_09';
  const fakeResetToken = 'SMOKE_TOKEN_RESET_2026_05_09';
  const fakeChangeToken = 'SMOKE_TOKEN_CHANGE_2026_05_09';

  return [
    {
      kind: 'verify-email-en',
      subject: '[SMOKE] Verify your Musaium email',
      recipient,
      html: buildVerifyEmail({
        verifyUrl: `${FRONTEND_URL}/en/verify-email?token=${fakeVerifyToken}`,
        locale: 'en',
      }),
    },
    {
      kind: 'reset-password-en',
      subject: '[SMOKE] Reset your Musaium password',
      recipient,
      html: buildResetPasswordEmail({
        resetUrl: `${FRONTEND_URL}/en/reset-password?token=${fakeResetToken}`,
        locale: 'en',
      }),
    },
    {
      kind: 'change-email-en',
      subject: '[SMOKE] Confirm your Musaium email change',
      recipient,
      html: buildChangeEmailEmail({
        confirmUrl: `${FRONTEND_URL}/en/confirm-email-change?token=${fakeChangeToken}`,
        locale: 'en',
      }),
    },
    {
      kind: 'support-contact',
      subject: '[SMOKE] [Musaium Support] Ada Lovelace <ada.lovelace@example.com>',
      recipient,
      html: buildSupportContactEmail({
        name: 'Ada Lovelace',
        email: 'ada.lovelace@example.com',
        message:
          'Hi Musaium team,\n\nI loved the Klimt walk last weekend at the Belvedere — but the audio kept stopping at the second stop. Could you check the audio file for that point?\n\nMany thanks,\nAda',
        ip: '203.0.113.42',
        requestId: 'req-2026-05-09-smoke-abc',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
      }),
    },
    {
      kind: 'review-moderation-fr-approved',
      subject: '[SMOKE] Votre avis a été publié',
      recipient,
      html: buildReviewModerationEmail({
        recipientName: 'Camille Dupont',
        rating: 4,
        comment:
          'Une expérience fascinante au Louvre — le compagnon Musaium a rendu la balade vivante.',
        locale: 'fr',
        status: 'approved',
      }),
    },
    {
      kind: 'review-moderation-fr-rejected',
      subject: '[SMOKE] Votre avis a été refusé',
      recipient,
      html: buildReviewModerationEmail({
        recipientName: 'Jean Martin',
        rating: 2,
        comment: 'Contenu non publié.',
        locale: 'fr',
        status: 'rejected',
      }),
    },
    {
      kind: 'review-moderation-en-approved',
      subject: '[SMOKE] Your review has been published',
      recipient,
      html: buildReviewModerationEmail({
        recipientName: 'Sarah Chen',
        rating: 5,
        comment:
          'Outstanding tour of the Uffizi — the AI companion knew exactly when to speak and when to let me look.',
        locale: 'en',
        status: 'approved',
      }),
    },
    {
      kind: 'review-moderation-en-rejected',
      subject: '[SMOKE] Your review was rejected',
      recipient,
      html: buildReviewModerationEmail({
        recipientName: 'Alex Rivera',
        rating: 1,
        comment: 'Content not published.',
        locale: 'en',
        status: 'rejected',
      }),
    },
  ];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const apiKey = requireEnv('BREVO_API_KEY');
  const recipient = (process.env['SMOKE_EMAIL_RECIPIENT'] ?? DEFAULT_RECIPIENT).trim();

  console.log('[smoke-emails] Musaium email smoke test');
  console.log(`[smoke-emails] Recipient: ${recipient}`);
  console.log(`[smoke-emails] Frontend URL (used for fake links): ${FRONTEND_URL}`);
  console.log('[smoke-emails] ---');

  const service = new BrevoEmailService(apiKey);
  const variants = buildVariants(recipient);

  let successes = 0;
  let failures = 0;
  const errors: { kind: string; message: string }[] = [];

  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const sizeKb = (Buffer.byteLength(v.html, 'utf8') / 1024).toFixed(1);
    process.stdout.write(
      `[smoke-emails] [${String(i + 1)}/${String(variants.length)}] ${v.kind} (${sizeKb} kB) … `,
    );
    try {
      await service.sendEmail(v.recipient, v.subject, v.html);
      successes += 1;
      console.log('OK');
    } catch (error) {
      failures += 1;
      const message = (error as Error).message;
      errors.push({ kind: v.kind, message });
      console.log(`FAIL: ${message}`);
    }
    if (i < variants.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  console.log('[smoke-emails] ---');
  console.log(
    `[smoke-emails] Sent: ${String(successes)} / ${String(variants.length)} ; failed: ${String(failures)}`,
  );

  if (failures > 0) {
    console.log('[smoke-emails] Failures verbatim:');
    for (const e of errors) {
      console.log(`  - ${e.kind}: ${e.message}`);
    }
    process.exit(1);
  }

  console.log(
    `[smoke-emails] All ${String(variants.length)} variants accepted by Brevo. Check ${recipient} inbox.`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('[smoke-emails] Unexpected error:', (error as Error).stack ?? error);
  process.exit(1);
});
