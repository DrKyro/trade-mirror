import { eq } from "drizzle-orm";

import { auth } from "../src/lib/auth/auth";
import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";

async function ensureAdmin() {
  const email = "admin-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, existing.id));
    return existing;
  }

  const result = await auth.api.createUser({
    body: {
      email,
      password: "AdminVerify123!",
      name: "Admin Verify",
      role: "admin",
    },
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, result.user.id),
  });

  if (!created) {
    throw new Error("Failed to create admin verification user.");
  }

  return created;
}

async function withAdminHeaders(adminEmail: string, fn: (headers: Headers) => Promise<void>) {
  const signIn = await auth.api.signInEmail({
    body: {
      email: adminEmail,
      password: "AdminVerify123!",
    },
    asResponse: true,
    returnHeaders: true,
  });

  const headers = new Headers();
  for (const cookie of signIn.headers?.getSetCookie() ?? []) {
    const raw = cookie.split(";")[0];
    const current = headers.get("cookie");
    headers.set("cookie", current ? `${current}; ${raw}` : raw);
  }

  const session = await auth.api.getSession({
    headers,
  });

  if (session?.user.role !== "admin") {
    throw new Error(`Expected admin role after sign-in, received ${session?.user.role ?? "none"}.`);
  }

  await fn(headers);
}

async function main() {
  const adminUser = await ensureAdmin();
  const verifyEmail = `managed-${crypto.randomUUID().slice(0, 8)}@example.com`;

  await withAdminHeaders(adminUser.email, async (headers) => {
    const listBefore = await auth.api.listUsers({
      headers,
      query: {
        limit: 200,
      },
    });

    const created = await auth.api.createUser({
      headers,
      body: {
        name: "Managed Verify",
        email: verifyEmail,
        password: "ManagedVerify123!",
        role: "user",
      },
    });

    const updated = await auth.api.adminUpdateUser({
      headers,
      body: {
        userId: created.user.id,
        data: {
          role: "admin",
          name: "Managed Verify Updated",
        },
      },
    });

    await auth.api.removeUser({
      headers,
      body: {
        userId: created.user.id,
      },
    });

    const listAfter = await auth.api.listUsers({
      headers,
      query: {
        limit: 200,
      },
    });

    console.log(
      JSON.stringify(
        {
          adminUserId: adminUser.id,
          listBeforeCount: listBefore.total,
          createdUserId: created.user.id,
          updatedRole: updated.role ?? null,
          updatedName: updated.name,
          removedUserMissing: !listAfter.users.some((entry) => entry.email === verifyEmail),
        },
        null,
        2,
      ),
    );
  });

  const adminCount = await db.select().from(user).where(eq(user.email, "admin-verify@example.com"));

  if (adminCount.length === 0) {
    throw new Error("Admin verification user missing after verification.");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
