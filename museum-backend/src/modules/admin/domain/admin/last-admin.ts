import { UserRole } from '@modules/auth/domain/user/user-role';
import { AppError } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

const GUARDED_TIERS = [
  { name: 'ADMIN', roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
  { name: 'SUPER_ADMIN', roles: [UserRole.SUPER_ADMIN] },
] as const;

export type AccountRemoval = 'DEMOTE' | 'DELETE' | 'SUSPEND';

type AccountState = Pick<AdminUserDTO, 'role' | 'suspended' | 'deletedAt'>;

export const isActiveAccount = (account: Pick<AccountState, 'suspended' | 'deletedAt'>): boolean =>
  !account.suspended && account.deletedAt === null;

export const refuseRemovingLastAccount = async (
  repository: Pick<IAdminRepository, 'countActiveAccounts'>,
  account: AccountState,
  removal: AccountRemoval,
  keptRole?: UserRole,
): Promise<void> => {
  if (!isActiveAccount(account)) return;
  for (const tier of GUARDED_TIERS) {
    const roles: readonly UserRole[] = tier.roles;
    const leavesTier =
      roles.includes(account.role) && (keptRole === undefined || !roles.includes(keptRole));
    if (leavesTier && (await repository.countActiveAccounts(tier.roles)) <= 1) {
      const code = `CANNOT_${removal}_LAST_${tier.name}`;
      throw new AppError({ message: code, statusCode: 409, code });
    }
  }
};
