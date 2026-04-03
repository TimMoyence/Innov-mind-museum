import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/api/admin.api";

const statCards = [
  { key: "totalUsers", label: "Total Users", color: "bg-primary-500" },
  { key: "activeUsers", label: "Active Users", color: "bg-green-500" },
  { key: "totalConversations", label: "Conversations", color: "bg-purple-500" },
  { key: "totalMessages", label: "Total Messages", color: "bg-indigo-500" },
  { key: "newUsersToday", label: "New Today", color: "bg-amber-500" },
  { key: "messagesThisWeek", label: "Messages This Week", color: "bg-teal-500" },
] as const;

export function DashboardPage() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: getStats,
    staleTime: 30_000,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Dashboard</h1>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Failed to load stats. {(error as Error).message}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map(({ key, label, color }) => (
            <div
              key={key}
              className="overflow-hidden rounded-xl bg-white shadow-sm"
            >
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <div className={`rounded-lg ${color} p-3`}>
                    <div className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-muted">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">
                      {stats[key].toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
