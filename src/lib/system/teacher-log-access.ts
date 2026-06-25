import "@tanstack/react-start/server-only";
import type { LogEntry } from "#/lib/system/logs";
import { listTeacherLogs, readLogFile } from "#/lib/system/logs";
import { getTradingRuntime } from "#/lib/trading/runtime";

async function ensureTeacherOwnedByUser(userId: string, teacherId: string) {
  const teachers = await getTradingRuntime().getTeachersForUser(userId);
  const teacher = teachers.find((entry) => entry.id === teacherId);

  if (!teacher) {
    throw new Error("Forbidden");
  }

  return teacher;
}

function findTeacherLogEntry(logs: LogEntry[], sourceKey: string, relativePath: string) {
  return logs.find((entry) => entry.sourceKey === sourceKey && entry.relativePath === relativePath);
}

export async function listTeacherLogsForUser(userId: string, teacherId: string) {
  await ensureTeacherOwnedByUser(userId, teacherId);
  return listTeacherLogs(teacherId);
}

export async function readTeacherLogForUser(
  userId: string,
  teacherId: string,
  sourceKey: string,
  relativePath: string,
) {
  const logs = await listTeacherLogsForUser(userId, teacherId);
  const matchedEntry = findTeacherLogEntry(logs, sourceKey, relativePath);

  if (!matchedEntry) {
    throw new Error("Forbidden");
  }

  return readLogFile(sourceKey, relativePath);
}
