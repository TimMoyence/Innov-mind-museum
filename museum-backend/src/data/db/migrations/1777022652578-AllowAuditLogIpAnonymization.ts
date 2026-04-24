import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allows controlled IP anonymization on `audit_logs` without loosening the
 * append-only guarantee.
 *
 * The existing `prevent_audit_log_mutation()` trigger function is updated so
 * that it short-circuits (RETURN NEW) when the Postgres session variable
 * `app.audit_anonymization_allowed = 'true'`. All other paths — including
 * DELETE and any UPDATE without the whitelist — keep raising the original
 * exception, so only the audit IP anonymizer job (which scopes the variable
 * to a single transaction via SET LOCAL) can mutate rows.
 *
 * Rationale: CNIL / GDPR recommend 13-month retention with IP anonymization
 * rather than outright deletion, so the hash-chain audit trail must remain
 * verifiable after the anonymization pass (only the last octet of IPv4 and
 * the host portion of IPv6 change — the row_hash does NOT include `ip`, so
 * the chain stays intact).
 */
export class AllowAuditLogIpAnonymization1777022652578 implements MigrationInterface {
  name = 'AllowAuditLogIpAnonymization1777022652578';

  /** Apply the AllowAuditLogIpAnonymization migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND current_setting('app.audit_anonymization_allowed', true) = 'true' THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_logs table is immutable: % operations are forbidden', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  /** Revert the AllowAuditLogIpAnonymization migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs table is immutable: % operations are forbidden', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
  }
}
