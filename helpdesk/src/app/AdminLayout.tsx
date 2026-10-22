import { Outlet } from 'react-router-dom';
import { AdminShell } from '@/components/admin/AdminShell';

/** Layout de `/admin/*`, fora do AgentLayout. */
export function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
