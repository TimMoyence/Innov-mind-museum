import { createHash } from 'node:crypto';

export const AUDIT_CHAIN_GENESIS_HASH = '0'.repeat(64);

export type HashVersion = 1 | 2;

export const CURRENT_HASH_VERSION: HashVersion = 2;

function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(byCodeUnit);
  return (
    '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}'
  );
}

function legacyMetadataJson(metadata: Record<string, unknown>): string {
  return JSON.stringify(
    metadata,
    Object.keys(metadata).sort((a, b) => a.localeCompare(b)),
  );
}

export interface AuditChainRow {
  id: string;
  actorId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  prevHash: string;
  rowHash: string;
  hashVersion?: HashVersion;
}

export interface AuditChainInput {
  id: string;
  actorId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export function computeRowHash(
  input: AuditChainInput,
  prevHash: string,
  hashVersion: HashVersion = CURRENT_HASH_VERSION,
): string {
  let metadataJson = '';
  if (input.metadata !== null) {
    metadataJson =
      hashVersion === 1 ? legacyMetadataJson(input.metadata) : canonicalStringify(input.metadata);
  }

  const payload = [
    input.id,
    input.actorId ?? '',
    input.action,
    input.targetType ?? '',
    input.targetId ?? '',
    metadataJson,
    input.createdAt.toISOString(),
    prevHash,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

export interface AuditChainVerifyResult {
  valid: boolean;
  firstBreakAt: number | null;
  firstBreakId: string | null;
  checked: number;
}

export function verifyAuditChain(rows: readonly AuditChainRow[]): AuditChainVerifyResult {
  let expectedPrev = AUDIT_CHAIN_GENESIS_HASH;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        firstBreakAt: index,
        firstBreakId: row.id,
        checked: index + 1,
      };
    }

    const expectedRowHash = computeRowHash(
      {
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
      },
      row.prevHash,
      row.hashVersion ?? CURRENT_HASH_VERSION,
    );

    if (expectedRowHash !== row.rowHash) {
      return {
        valid: false,
        firstBreakAt: index,
        firstBreakId: row.id,
        checked: index + 1,
      };
    }

    expectedPrev = row.rowHash;
  }

  return { valid: true, firstBreakAt: null, firstBreakId: null, checked: rows.length };
}
