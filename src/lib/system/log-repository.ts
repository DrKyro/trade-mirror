import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdminSession } from "#/lib/auth/admin";
import { authMiddleware } from "#/lib/auth/middleware";
import { listAllLogs, listTeacherLogs, readLogFile } from "#/lib/system/logs";
import { listTeacherLogsForUser, readTeacherLogForUser } from "#/lib/system/teacher-log-access";

export const $listLogs = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminSession();
  return listAllLogs();
});

const teacherLogsSchema = z.object({
  teacherId: z.string().min(1),
});

export const $listTeacherLogs = createServerFn({ method: "GET" })
  .validator(teacherLogsSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    return listTeacherLogs(data.teacherId);
  });

export const $listTeacherLogsForCurrentUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(teacherLogsSchema)
  .handler(async ({ context, data }) => {
    return listTeacherLogsForUser(context.user.id, data.teacherId);
  });

const readLogSchema = z.object({
  sourceKey: z.string().min(1),
  relativePath: z.string().min(1),
});

export const $readLog = createServerFn({ method: "GET" })
  .validator(readLogSchema)
  .handler(async ({ data }) => {
    await requireAdminSession();
    const content = await readLogFile(data.sourceKey, data.relativePath);

    return {
      sourceKey: data.sourceKey,
      relativePath: data.relativePath,
      content,
    };
  });

const readTeacherLogSchema = z.object({
  teacherId: z.string().min(1),
  sourceKey: z.string().min(1),
  relativePath: z.string().min(1),
});

export const $readTeacherLogForCurrentUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(readTeacherLogSchema)
  .handler(async ({ context, data }) => {
    const content = await readTeacherLogForUser(
      context.user.id,
      data.teacherId,
      data.sourceKey,
      data.relativePath,
    );

    return {
      teacherId: data.teacherId,
      sourceKey: data.sourceKey,
      relativePath: data.relativePath,
      content,
    };
  });
