import { apiClient } from "./client";
import type {
  AuditLog,
  DashboardStats,
  ListAuditLogsParams,
  ListUsersParams,
  PaginatedResponse,
  User,
  UserRole,
} from "./types";

export async function listUsers(
  params: ListUsersParams = {},
): Promise<PaginatedResponse<User>> {
  const { data } = await apiClient.get<PaginatedResponse<User>>(
    "/admin/users",
    { params },
  );
  return data;
}

export async function changeUserRole(
  userId: string,
  role: UserRole,
): Promise<User> {
  const { data } = await apiClient.patch<User>(`/admin/users/${userId}/role`, {
    role,
  });
  return data;
}

export async function listAuditLogs(
  params: ListAuditLogsParams = {},
): Promise<PaginatedResponse<AuditLog>> {
  const { data } = await apiClient.get<PaginatedResponse<AuditLog>>(
    "/admin/audit-logs",
    { params },
  );
  return data;
}

export async function getStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>("/admin/stats");
  return data;
}
