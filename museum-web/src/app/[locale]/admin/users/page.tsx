export default function UsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Utilisateurs</h1>
      <p className="mt-1 text-text-secondary">Manage platform users.</p>

      {/* Placeholder table */}
      <div className="mt-8 overflow-hidden rounded-xl border border-primary-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-primary-100 bg-surface-elevated">
            <tr>
              <th className="px-6 py-3 font-medium text-text-secondary">ID</th>
              <th className="px-6 py-3 font-medium text-text-secondary">Email</th>
              <th className="px-6 py-3 font-medium text-text-secondary">Role</th>
              <th className="px-6 py-3 font-medium text-text-secondary">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-text-muted">
                No data yet — connect to API to populate.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
