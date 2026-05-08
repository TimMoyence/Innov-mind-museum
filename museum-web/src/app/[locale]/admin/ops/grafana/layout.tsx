import type { ReactNode } from 'react';
import { RoleGuard } from '@/lib/auth';

/**
 * Ops sub-tree layout — gates the Grafana iframe panel to the highest
 * role available in the `UserRole` enum (`admin`). The backend currently
 * does not distinguish a `super_admin` role from `admin`; if Tim wants
 * that granularity it lands as a backend `UserRole` enum extension and
 * the `allowedRoles` here flips to `['super_admin']`. Until then,
 * `admin` is the de-facto super-admin (V1 has exactly one — Tim).
 *
 * The layout renders inside the parent `AdminShell` so the side-nav and
 * dictionary context stay intact ; the `RoleGuard` runs a second time
 * here so a `moderator` (allowed by `AdminShell`) is rejected.
 */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return <RoleGuard allowedRoles={['admin']}>{children}</RoleGuard>;
}
