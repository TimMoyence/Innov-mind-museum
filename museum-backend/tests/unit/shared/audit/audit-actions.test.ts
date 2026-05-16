/**
 * R1 RED — audit action constants (T1, AC19).
 *
 * Pins R1 §0.3 Appendix A + N3 + AC19 down BEFORE implementation : a new
 * `AUDIT_ADMIN_USER_TIER_CHANGED` constant exported from `@shared/audit`,
 * value `'ADMIN_USER_TIER_CHANGED'` (mirror of `AUDIT_ADMIN_USER_SUSPENDED`
 * naming — uppercase snake-case).
 *
 * MUST FAIL at baseline `cd7e22bc` — the constant is absent from
 * `src/shared/audit/audit.types.ts` and the barrel `src/shared/audit/index.ts`.
 *
 * The audit chain verifier (AC19) reads action constants from the source-of-
 * truth module — adding the constant downstream is what makes the
 * `pnpm audit-chain:verify` invocation recognise the new action without an
 * "unknown action" warning. Until the constant exists, both this test and
 * the verifier integration in T3 fail for the same root cause.
 */
import * as auditModule from '@shared/audit';

describe('audit action constants — R1 admin tier flip (R1 §0.3 Appendix A)', () => {
  it('exports AUDIT_ADMIN_USER_TIER_CHANGED', () => {
    expect(auditModule).toHaveProperty('AUDIT_ADMIN_USER_TIER_CHANGED');
  });

  it('AUDIT_ADMIN_USER_TIER_CHANGED equals literal "ADMIN_USER_TIER_CHANGED"', () => {
    const value = (auditModule as unknown as Record<string, unknown>).AUDIT_ADMIN_USER_TIER_CHANGED;
    // Naming mirror : AUDIT_ADMIN_USER_SUSPENDED='ADMIN_USER_SUSPENDED',
    // AUDIT_ADMIN_USER_DELETED='ADMIN_USER_DELETED'. Same section, same shape.
    expect(value).toBe('ADMIN_USER_TIER_CHANGED');
  });

  it('AUDIT_ADMIN_USER_TIER_CHANGED is a unique action key (no collision)', () => {
    const allActions = Object.entries(auditModule)
      .filter(([k]) => k.startsWith('AUDIT_'))
      .map(([, v]) => v);
    // The constant must not duplicate an existing audit action literal.
    const tierValue = (auditModule as unknown as Record<string, unknown>)
      .AUDIT_ADMIN_USER_TIER_CHANGED;
    const duplicates = allActions.filter((v) => v === tierValue);
    expect(duplicates).toHaveLength(1);
  });
});
