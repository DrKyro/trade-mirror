import { getRequest } from "@tanstack/react-start/server";

import { auth } from "#/lib/auth/auth";

export type AdminRole = "admin" | "user";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: string | null;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function getCurrentSession() {
  const request = getRequest();
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session;
}

export async function requireAdminSession() {
  const session = await getCurrentSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  if (session.user.role !== "admin") {
    throw new Error("Forbidden");
  }

  return session;
}

export function mapManagedUser(user: Record<string, unknown>): ManagedUser {
  return {
    id: String(user.id),
    name: String(user.name ?? ""),
    email: String(user.email ?? ""),
    emailVerified: Boolean(user.emailVerified),
    image: typeof user.image === "string" ? user.image : null,
    role: typeof user.role === "string" ? user.role : null,
    banned: Boolean(user.banned),
    banReason: typeof user.banReason === "string" ? user.banReason : null,
    banExpires: user.banExpires instanceof Date ? user.banExpires : null,
    createdAt: user.createdAt instanceof Date ? user.createdAt : undefined,
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt : undefined,
  };
}
