export function isAdminUser(user: { role?: string | null } | null | undefined) {
  return user?.role === "admin";
}
