import fs from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import {
  listTeacherLogsForUser,
  readTeacherLogForUser,
} from "../src/lib/system/teacher-log-access";
import { getTradingRuntime } from "../src/lib/trading/runtime";

async function ensureUser(email: string, name: string) {
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `teacher-log-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name,
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error(`Failed to create verification user for ${email}.`);
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const owner = await ensureUser("teacher-log-owner@example.com", "Teacher Log Owner");
  const outsider = await ensureUser("teacher-log-outsider@example.com", "Teacher Log Outsider");
  const teacherId = `verify-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const otherTeacherId = `verify-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const teacherRelativePath = `teachers/teacher_${teacherId}/owner-access.log`;
  const otherRelativePath = `teachers/teacher_${otherTeacherId}/other-access.log`;
  const unrelatedRelativePath = "system/unrelated.log";
  const teacherAbsolutePath = path.join(process.cwd(), "logs", teacherRelativePath);
  const otherAbsolutePath = path.join(process.cwd(), "logs", otherRelativePath);
  const unrelatedAbsolutePath = path.join(process.cwd(), "logs", unrelatedRelativePath);

  await fs.mkdir(path.dirname(teacherAbsolutePath), { recursive: true });
  await fs.mkdir(path.dirname(otherAbsolutePath), { recursive: true });
  await fs.mkdir(path.dirname(unrelatedAbsolutePath), { recursive: true });
  await fs.writeFile(teacherAbsolutePath, `owner access ${teacherId}\n`, "utf8");
  await fs.writeFile(otherAbsolutePath, `other teacher ${otherTeacherId}\n`, "utf8");
  await fs.writeFile(unrelatedAbsolutePath, "not a teacher log\n", "utf8");

  try {
    await runtime.addTeacher({
      ownerUserId: owner.id,
      id: teacherId,
      name: "Teacher Log Verify",
      platform: "bitget",
    });

    const ownerLogs = await listTeacherLogsForUser(owner.id, teacherId);
    const ownerContent = await readTeacherLogForUser(
      owner.id,
      teacherId,
      "platform",
      teacherRelativePath,
    );

    let outsiderBlocked = false;
    try {
      await listTeacherLogsForUser(outsider.id, teacherId);
    } catch {
      outsiderBlocked = true;
    }

    let unrelatedBlocked = false;
    try {
      await readTeacherLogForUser(owner.id, teacherId, "platform", unrelatedRelativePath);
    } catch {
      unrelatedBlocked = true;
    }

    let otherTeacherBlocked = false;
    try {
      await readTeacherLogForUser(owner.id, teacherId, "platform", otherRelativePath);
    } catch {
      otherTeacherBlocked = true;
    }

    console.log(
      JSON.stringify(
        {
          teacherId,
          ownerCanList: ownerLogs.some((entry) => entry.relativePath === teacherRelativePath),
          ownerCanRead: ownerContent.includes(teacherId),
          outsiderBlocked,
          unrelatedBlocked,
          otherTeacherBlocked,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.removeTeacherForUser(owner.id, teacherId);
    await fs.rm(path.join(process.cwd(), "logs", `teachers/teacher_${teacherId}`), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(process.cwd(), "logs", `teachers/teacher_${otherTeacherId}`), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(process.cwd(), "logs", "system"), {
      recursive: true,
      force: true,
    });
    await db.execute(sql`delete from "user" where id in (${owner.id}, ${outsider.id})`);
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
