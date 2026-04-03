import type { UserRole } from "@/api/types";

const roleStyles: Record<UserRole, string> = {
  visitor: "bg-surface-muted text-text-secondary",
  moderator: "bg-primary-100 text-primary-700",
  museum_manager: "bg-green-100 text-green-700",
  admin: "bg-red-100 text-red-700",
};

const roleLabels: Record<UserRole, string> = {
  visitor: "Visitor",
  moderator: "Moderator",
  museum_manager: "Manager",
  admin: "Admin",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleStyles[role]}`}
    >
      {roleLabels[role]}
    </span>
  );
}
