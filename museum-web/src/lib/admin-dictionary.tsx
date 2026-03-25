'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n';

/** The admin slice of the dictionary, passed from a Server Component. */
type AdminDict = Dictionary['admin'];

const AdminDictContext = createContext<AdminDict | null>(null);

interface AdminDictProviderProps {
  dict: AdminDict;
  children: ReactNode;
}

export function AdminDictProvider({ dict, children }: AdminDictProviderProps) {
  return (
    <AdminDictContext.Provider value={dict}>
      {children}
    </AdminDictContext.Provider>
  );
}

export function useAdminDict(): AdminDict {
  const ctx = useContext(AdminDictContext);
  if (!ctx) {
    throw new Error('useAdminDict must be used within an AdminDictProvider');
  }
  return ctx;
}
