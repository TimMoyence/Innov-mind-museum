interface UserDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">
        Utilisateur #{id}
      </h1>
      <p className="mt-1 text-text-secondary">User detail view.</p>

      <div className="mt-8 rounded-xl border border-primary-100 bg-white p-8">
        <div className="space-y-4 text-text-muted">
          <div className="flex gap-4">
            <span className="w-24 font-medium text-text-secondary">ID:</span>
            <span>{id}</span>
          </div>
          <div className="flex gap-4">
            <span className="w-24 font-medium text-text-secondary">Email:</span>
            <span>---</span>
          </div>
          <div className="flex gap-4">
            <span className="w-24 font-medium text-text-secondary">Role:</span>
            <span>---</span>
          </div>
          <div className="flex gap-4">
            <span className="w-24 font-medium text-text-secondary">Created:</span>
            <span>---</span>
          </div>
        </div>
      </div>
    </div>
  );
}
