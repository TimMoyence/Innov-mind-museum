import 'dotenv/config';
import 'reflect-metadata';

import * as fs from 'node:fs';

import { AppDataSource } from '@data/db/data-source';
import { AUDIT_CHAIN_GENESIS_HASH, type AuditChainRow } from '@shared/audit/audit-chain';
import { verifyChainAndFormat, type AuditChainCliResult } from '@shared/audit/audit-chain-cli-core';
import { AuditLog } from '@shared/audit/auditLog.entity';
import { errorMessage } from '@shared/errors/error-message';

function emitStdout(payload: AuditChainCliResult['payload']): void {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

async function postSlackAlert(webhookUrl: string | undefined, text: string): Promise<void> {
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      process.stderr.write(
        `[audit-chain-verify] slack POST failed: ${res.status} ${res.statusText}\n`,
      );
    }
  } catch (err) {
    const msg = errorMessage(err);
    process.stderr.write(`[audit-chain-verify] slack POST error: ${msg}\n`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function postBrevoAlert(
  apiKey: string | undefined,
  recipient: string | undefined,
  text: string,
): Promise<void> {
  if (!apiKey || !recipient) return;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Musaium audit-chain', email: 'no-reply@musaium.com' },
        to: [{ email: recipient }],
        subject: '[Musaium] audit-chain break detected',
        htmlContent: `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      process.stderr.write(
        `[audit-chain-verify] brevo POST failed: ${String(res.status)} ${res.statusText} ${body.slice(0, 400)}\n`,
      );
    }
  } catch (err) {
    const msg = errorMessage(err);
    process.stderr.write(`[audit-chain-verify] brevo POST error: ${msg}\n`);
  }
}

function loadFixtureRows(filePath: string): AuditChainRow[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`fixture is not a JSON array: ${filePath}`);
  }

  return parsed.map((r) => {
    const row = r as AuditChainRow & { createdAt: string | Date };
    return { ...row, createdAt: new Date(row.createdAt) };
  });
}

async function loadDbRows(): Promise<AuditChainRow[]> {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.getRepository(AuditLog).find({
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      prevHash: r.prevHash ?? AUDIT_CHAIN_GENESIS_HASH,
      rowHash: r.rowHash,
      hashVersion: (r.hashVersion ?? 1) as 1 | 2,
    }));
  } finally {
    await AppDataSource.destroy();
  }
}

async function main(): Promise<void> {
  const fixturePath = process.env.AUDIT_CHAIN_VERIFY_FIXTURE;
  const rows = fixturePath ? loadFixtureRows(fixturePath) : await loadDbRows();

  const result = verifyChainAndFormat(rows);

  emitStdout(result.payload);

  if (result.exitCode === 1 && result.alertText) {
    await Promise.all([
      postSlackAlert(process.env.DEPLOY_ALERT_SLACK_WEBHOOK, result.alertText),
      postBrevoAlert(
        process.env.BREVO_API_KEY,
        process.env.AUDIT_CHAIN_ALERT_EMAIL,
        result.alertText,
      ),
    ]);
  }

  process.exit(result.exitCode);
}

main().catch((err: unknown) => {
  const msg = errorMessage(err);
  process.stderr.write(`[audit-chain-verify] ${msg}\n`);
  process.exit(2);
});
