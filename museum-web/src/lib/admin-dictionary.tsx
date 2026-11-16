'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n';

type AdminDict = Dictionary['admin'];

export type AdminLocale = 'fr' | 'en';

interface AdminDictContextValue {
  dict: AdminDict;
  locale: AdminLocale;
}

const AdminDictContext = createContext<AdminDictContextValue | null>(null);

interface AdminDictProviderProps {
  dict: AdminDict;
  locale: AdminLocale;
  children: ReactNode;
}

export function AdminDictProvider({ dict, locale, children }: AdminDictProviderProps) {
  return <AdminDictContext.Provider value={{ dict, locale }}>{children}</AdminDictContext.Provider>;
}

export function useAdminDict(): AdminDict {
  const ctx = useContext(AdminDictContext);
  if (!ctx) {
    throw new Error('useAdminDict must be used within an AdminDictProvider');
  }
  return ctx.dict;
}

export function useAdminLocale(): AdminLocale {
  const ctx = useContext(AdminDictContext);
  if (!ctx) {
    throw new Error('useAdminLocale must be used within an AdminDictProvider');
  }
  return ctx.locale;
}

export const userActionRefusals = (dict: AdminDict): Readonly<Record<string, string>> => ({
  CANNOT_DELETE_LAST_ADMIN: dict.userDetailPage.errorLastAdmin,
  CANNOT_DELETE_LAST_SUPER_ADMIN: dict.common.errorDeleteLastSuperAdmin,
  CANNOT_DEMOTE_LAST_ADMIN: dict.common.errorDemoteLastAdmin,
  CANNOT_DEMOTE_LAST_SUPER_ADMIN: dict.common.errorDemoteLastSuperAdmin,
  CANNOT_SUSPEND_LAST_ADMIN: dict.common.errorSuspendLastAdmin,
  CANNOT_SUSPEND_LAST_SUPER_ADMIN: dict.common.errorSuspendLastSuperAdmin,
  CANNOT_SUSPEND_SELF: dict.userDetailPage.errorSelfAction,
  SUPER_ADMIN_REQUIRED: dict.common.errorSuperAdminRequired,
});
