'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n';

/** The admin slice of the dictionary, passed from a Server Component. */
type AdminDict = Dictionary['admin'];

/** Supported admin locales. Mirrors the URL segment in `/[locale]/admin`. */
export type AdminLocale = 'fr' | 'en';

/**
 * Combined context value: the dictionary slice + the active locale.
 *
 * Exposing `locale` alongside `dict` eliminates the fragile
 * `adminDict.dashboard === 'Tableau de bord'` heuristic that 6 admin pages
 * used to detect French. The locale now flows from the URL segment
 * (extracted by the Server Component and passed to `AdminShell`) through
 * the provider, giving a deterministic, trust-boundary-safe value.
 */
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
  return (
    <AdminDictContext.Provider value={{ dict, locale }}>{children}</AdminDictContext.Provider>
  );
}

/** Returns the admin dictionary slice. Throws when used outside `<AdminDictProvider>`. */
export function useAdminDict(): AdminDict {
  const ctx = useContext(AdminDictContext);
  if (!ctx) {
    throw new Error('useAdminDict must be used within an AdminDictProvider');
  }
  return ctx.dict;
}

/** Returns the active admin locale ('fr' | 'en'). Throws when used outside `<AdminDictProvider>`. */
export function useAdminLocale(): AdminLocale {
  const ctx = useContext(AdminDictContext);
  if (!ctx) {
    throw new Error('useAdminLocale must be used within an AdminDictProvider');
  }
  return ctx.locale;
}
