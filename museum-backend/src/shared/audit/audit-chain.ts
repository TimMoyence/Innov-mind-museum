import { createHash } from 'node:crypto';

/** Genesis prev_hash for first audit log row (64 hex zeros). */
export const AUDIT_CHAIN_GENESIS_HASH = '0'.repeat(64);

/**
 * Version of the metadata serialization algorithm used to compute `row_hash`.
 *   - `1` = legacy serializer (FROZEN): `JSON.stringify(meta, Object.keys(meta).sort())`,
 *           a replacer-allowlist applied recursively but fed only top-level keys, so
 *           every nested object collapsed to `{}` (the AUDIT-01 / TD-61 collision bug).
 *           Kept byte-for-byte so already-persisted rows still verify without false BREAK.
 *   - `2` = `canonicalStringify` — deep-recursive, keys sorted at every level, nested
 *           content fully contributes to the hash (tamper-evident as intended).
 *
 * The version is carried OUT of the hash payload (a dedicated `hash_version` column,
 * like `ip`/`requestId`), so introducing it invalidates no existing `row_hash`.
 */
export type HashVersion = 1 | 2;

/** Algorithm version used for all NEW rows. Legacy rows are stamped `1` by migration default. */
export const CURRENT_HASH_VERSION: HashVersion = 2;

/**
 * Deterministic, locale-independent key comparator on UTF-16 code units.
 *
 * `localeCompare` depends on the ICU locale (`process.env.LANG`, Node/ICU version)
 * → non-deterministic cross-platform. Plain `<`/`>` on JS strings is the UTF-16
 * code-unit order (identical to `Array.prototype.sort()` with no comparator),
 * deterministic everywhere. This is the SINGLE comparator used by
 * `canonicalStringify` so runtime ≡ migration ≡ test oracle by construction.
 *
 * @param a left key
 * @param b right key
 * @returns -1, 0 or 1 by code-unit order
 */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Canonical, deterministic JSON serialization with keys sorted at EVERY nesting
 * level (deep-recursive). This is the single source of truth shared by the runtime
 * (`computeRowHash`) and the backfill migration (`AddAuditLogHashChain`).
 *
 * Contract:
 *   - `null` / scalars → `JSON.stringify(value)`.
 *   - arrays → order PRESERVED, each element serialized recursively.
 *   - objects → keys sorted by UTF-16 code unit (`byCodeUnit`), each entry
 *     `JSON.stringify(key) + ':' + canonicalStringify(value)`.
 *
 * Pure: no dependency beyond `node:crypto` consumers — safe to import from a
 * TypeORM migration (no decorators, no DataSource, no import side effects).
 *
 * @param value the value to serialize
 * @returns the canonical deep-sorted JSON string
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(byCodeUnit);
  return (
    '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}'
  );
}

/**
 * Legacy (v1) metadata serializer — FROZEN reproduction of the original buggy
 * runtime: `JSON.stringify(meta, Object.keys(meta).sort(localeCompare))`. The
 * second argument is a replacer-allowlist applied recursively to all levels but
 * fed only the TOP-LEVEL keys, so nested objects serialize as `{}`. Kept exactly
 * so historical `row_hash` values recompute identically (zero false BREAK, R9).
 *
 * @param metadata the metadata object
 * @returns the legacy top-level-only JSON string
 */
function legacyMetadataJson(metadata: Record<string, unknown>): string {
  return JSON.stringify(
    metadata,
    Object.keys(metadata).sort((a, b) => a.localeCompare(b)),
  );
}

/** Hash chain row shape. Decoupled from TypeORM entity. */
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
  /** Serializer version for this row's `row_hash`. Absent ⇒ legacy (1). */
  hashVersion?: HashVersion;
}

/** Fields needed to compute row_hash (prevHash separate). */
export interface AuditChainInput {
  id: string;
  actorId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Canonical SHA-256 hash for an audit row.
 *
 * Layout (pipe-separated, UTF-8):
 *   id | actor_id | action | target_type | target_id | metadata_json | created_at_iso | prev_hash
 *
 * Null/undefined → empty string. The metadata serialization depends on
 * `hashVersion`: v1 = legacy top-level-only (FROZEN, historical rows), v2 =
 * `canonicalStringify` deep-recursive (default for new rows). `hashVersion`
 * itself is NOT part of the payload — only the serializer it selects. Pipe
 * order, separator and `null → ''` are unchanged (R8).
 *
 * @param input the audit chain input fields
 * @param prevHash hash of the previous row (genesis = 64 zeros)
 * @param hashVersion serializer version (default {@link CURRENT_HASH_VERSION})
 * @returns the SHA-256 hex digest of the row
 */
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
  /** Zero-based index of first broken row; null when chain intact. */
  firstBreakAt: number | null;
  firstBreakId: string | null;
  /** Total rows walked. */
  checked: number;
}

/**
 * Walks rows (oldest → newest), verifies each row_hash + prev_hash link.
 * Returns early on first mismatch. Empty input is valid.
 */
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
      // Verify each row under the serializer it was written with. Persisted rows
      // always carry an explicit hash_version (migration NOT NULL DEFAULT 1 stamps
      // legacy=1; new writes=2; CLI loader maps `r.hashVersion ?? 1`). The fallback
      // here governs only in-memory rows that omit the field — those were hashed
      // by the current writer, so they default to CURRENT_HASH_VERSION (v2). Legacy
      // rows keep verifying under v1 because they carry hashVersion:1 explicitly →
      // zero false BREAK (R9), genuine tampering of a v1 row still diverges (R10).
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
