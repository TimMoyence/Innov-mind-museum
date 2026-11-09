import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AdminDictProvider, useAdminDict } from './admin-dictionary';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      {children}
    </AdminDictProvider>
  );
}

describe('AdminDictProvider / useAdminDict', () => {
  it('provides the admin dictionary through context', () => {
    const { result } = renderHook(() => useAdminDict(), { wrapper });
    expect(result.current.dashboard).toBe('Dashboard');
    expect(result.current.users).toBe('Users');
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useAdminDict());
    }).toThrow('useAdminDict must be used within an AdminDictProvider');
  });
});
