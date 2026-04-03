import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUsers, changeUserRole } from "@/api/admin.api";
import type { UserRole } from "@/api/types";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { useAuth } from "@/auth/AuthContext";

const allRoles: UserRole[] = ["visitor", "moderator", "museum_manager", "admin"];

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole | "">("");

  // Fetch the user by filtering the list (until a dedicated endpoint exists)
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", "detail", id],
    queryFn: async () => {
      const result = await listUsers({ search: id, limit: 50 });
      const found = result.data.find((u) => u.id === id);
      if (!found) throw new Error("User not found");
      return found;
    },
    staleTime: 15_000,
  });

  const roleMutation = useMutation({
    mutationFn: (role: UserRole) => changeUserRole(id!, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setSelectedRole("");
    },
  });

  const isAdmin = currentUser?.role === "admin";

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {(error as Error)?.message || "User not found."}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate("/users")}
        className="mb-4 text-sm text-primary-600 hover:text-primary-800 hover:underline"
      >
        &larr; Back to Users
      </button>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-primary-100 bg-surface-elevated px-6 py-4">
          <h1 className="text-xl font-bold text-text-primary">{data.name}</h1>
          <p className="text-sm text-text-muted">{data.email}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          <div className="space-y-4">
            <InfoRow label="ID" value={data.id} />
            <InfoRow label="Role">
              <RoleBadge role={data.role} />
            </InfoRow>
            <InfoRow
              label="Status"
              value={data.isActive ? "Active" : "Inactive"}
            />
            <InfoRow
              label="Created"
              value={new Date(data.createdAt).toLocaleString()}
            />
            <InfoRow
              label="Last Login"
              value={
                data.lastLoginAt
                  ? new Date(data.lastLoginAt).toLocaleString()
                  : "Never"
              }
            />
          </div>

          {/* Role change (admin only) */}
          {isAdmin && (
            <div className="rounded-lg border border-primary-100 p-4">
              <h2 className="mb-3 text-sm font-semibold text-text-secondary">
                Change Role
              </h2>
              <div className="flex gap-2">
                <select
                  value={selectedRole || data.role}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="rounded-lg border border-primary-200 px-3 py-2 text-sm shadow-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                >
                  {allRoles.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (selectedRole && selectedRole !== data.role) {
                      roleMutation.mutate(selectedRole);
                    }
                  }}
                  disabled={
                    !selectedRole ||
                    selectedRole === data.role ||
                    roleMutation.isPending
                  }
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {roleMutation.isPending ? "Saving..." : "Update"}
                </button>
              </div>

              {roleMutation.isError && (
                <p className="mt-2 text-sm text-red-600">
                  Failed to update role. {(roleMutation.error as Error).message}
                </p>
              )}

              {roleMutation.isSuccess && (
                <p className="mt-2 text-sm text-green-600">Role updated.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm font-medium text-text-muted">
        {label}
      </span>
      {children ?? <span className="text-sm text-text-primary">{value}</span>}
    </div>
  );
}
