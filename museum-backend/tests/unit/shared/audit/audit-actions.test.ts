import * as auditModule from '@shared/audit';

describe('audit action constants — R1 admin tier flip (R1 §0.3 Appendix A)', () => {
  it('exports AUDIT_ADMIN_USER_TIER_CHANGED', () => {
    expect(auditModule).toHaveProperty('AUDIT_ADMIN_USER_TIER_CHANGED');
  });

  it('AUDIT_ADMIN_USER_TIER_CHANGED equals literal "ADMIN_USER_TIER_CHANGED"', () => {
    const value = (auditModule as unknown as Record<string, unknown>).AUDIT_ADMIN_USER_TIER_CHANGED;
    expect(value).toBe('ADMIN_USER_TIER_CHANGED');
  });

  it('AUDIT_ADMIN_USER_TIER_CHANGED is a unique action key (no collision)', () => {
    const allActions = Object.entries(auditModule)
      .filter(([k]) => k.startsWith('AUDIT_'))
      .map(([, v]) => v);
    const tierValue = (auditModule as unknown as Record<string, unknown>)
      .AUDIT_ADMIN_USER_TIER_CHANGED;
    const duplicates = allActions.filter((v) => v === tierValue);
    expect(duplicates).toHaveLength(1);
  });
});
