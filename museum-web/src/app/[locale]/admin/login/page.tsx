'use client';

import { useAdminDict } from '@/lib/admin-dictionary';
import LoginForm from '@/components/admin/LoginForm';

export default function AdminLoginPage() {
  const adminDict = useAdminDict();

  return <LoginForm dict={adminDict.login} />;
}
