import { createServerFn } from "@tanstack/react-start";
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { mapManagedUser, requireAdminSession } from "#/lib/auth/admin";
import { db } from "#/lib/db";
import { account, session, user } from "#/lib/db/schema";

export const $listManagedUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminSession();

  const rows = await db.select().from(user).orderBy(desc(user.createdAt)).limit(200);
  const [{ value: total }] = await db.select({ value: count() }).from(user);

  return {
    users: rows.map((row) => mapManagedUser(row as unknown as Record<string, unknown>)),
    total,
  };
});

const createManagedUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(1),
  role: z.enum(["admin", "user"]).default("user"),
});

export const $createManagedUser = createServerFn({ method: "POST" })
  .validator(createManagedUserSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const id = generateRandomString(32);
    const now = new Date();
    const passwordHash = await hashPassword(data.password);

    await db.insert(user).values({
      id,
      name: data.name,
      email: data.email,
      emailVerified: false,
      role: data.role,
      banned: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(account).values({
      id: generateRandomString(32),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const [createdUser] = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return mapManagedUser(createdUser as unknown as Record<string, unknown>);
  });

const updateManagedUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  role: z.enum(["admin", "user"]),
});

export const $updateManagedUser = createServerFn({ method: "POST" })
  .validator(updateManagedUserSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();

    await db
      .update(user)
      .set({
        name: data.name,
        email: data.email,
        role: data.role,
        updatedAt: new Date(),
      })
      .where(eq(user.id, data.userId));

    const [updatedUser] = await db.select().from(user).where(eq(user.id, data.userId)).limit(1);
    return mapManagedUser(updatedUser as unknown as Record<string, unknown>);
  });

const setManagedUserPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

export const $setManagedUserPassword = createServerFn({ method: "POST" })
  .validator(setManagedUserPasswordSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const passwordHash = await hashPassword(data.password);

    await db
      .update(account)
      .set({
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(and(eq(account.userId, data.userId), eq(account.providerId, "credential")));

    return { success: true };
  });

const removeManagedUserSchema = z.object({
  userId: z.string().min(1),
});

export const $removeManagedUser = createServerFn({ method: "POST" })
  .validator(removeManagedUserSchema)
  .handler(async ({ data }) => {
    const currentSession = await requireAdminSession();

    if (currentSession.user.id === data.userId) {
      throw new Error("You cannot remove the currently signed-in admin.");
    }

    await db.delete(session).where(eq(session.userId, data.userId));
    await db.delete(account).where(eq(account.userId, data.userId));
    await db.delete(user).where(eq(user.id, data.userId));

    return { success: true };
  });
