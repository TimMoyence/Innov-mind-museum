const statCards = [
  { label: 'Total Users', value: '---', color: 'bg-primary-50 text-primary-700' },
  { label: 'Active Users', value: '---', color: 'bg-green-50 text-green-700' },
  { label: 'Conversations', value: '---', color: 'bg-accent-400/10 text-accent-600' },
  { label: 'Messages', value: '---', color: 'bg-purple-50 text-purple-700' },
  { label: 'New Today', value: '---', color: 'bg-amber-50 text-amber-700' },
  { label: 'Messages This Week', value: '---', color: 'bg-rose-50 text-rose-700' },
];

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Tableau de bord</h1>
      <p className="mt-1 text-text-secondary">
        Overview of your Musaium platform.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border border-primary-100 p-6 ${card.color}`}
          >
            <p className="text-sm font-medium opacity-80">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
