import "@tanstack/react-start/server-only";
import fs from "node:fs/promises";
import path from "node:path";

const LOG_ROOTS = [
  {
    key: "platform",
    label: "Trader Platform",
    path: path.join(process.cwd(), "logs"),
  },
  {
    key: "legacy-follow-manager",
    label: "FollowTraderManager",
    path: path.resolve(process.cwd(), "../FollowTraderManager/logs"),
  },
] as const;

export interface LogSource {
  key: string;
  label: string;
  path: string;
}

export interface LogEntry {
  sourceKey: string;
  sourceLabel: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  size: number;
  updatedAt: number;
}

function normalizeRelativePath(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("../") || normalized.includes("/../") || normalized === "..") {
    throw new Error("Invalid log path");
  }

  return normalized;
}

export function listLogSources(): readonly LogSource[] {
  return LOG_ROOTS;
}

async function walkLogs(root: LogSource, currentPath = ""): Promise<LogEntry[]> {
  const absoluteDir = path.join(root.path, currentPath);
  let entries: string[];

  try {
    entries = await fs.readdir(absoluteDir);
  } catch {
    return [];
  }

  const result: LogEntry[] = [];

  for (const entry of entries) {
    const relativePath = currentPath ? `${currentPath}/${entry}` : entry;
    const absolutePath = path.join(root.path, relativePath);
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory()) {
      result.push(...(await walkLogs(root, relativePath)));
      continue;
    }

    result.push({
      sourceKey: root.key,
      sourceLabel: root.label,
      fileName: entry,
      relativePath,
      absolutePath,
      size: stat.size,
      updatedAt: stat.mtimeMs,
    });
  }

  return result;
}

export async function listAllLogs() {
  const nested = await Promise.all(LOG_ROOTS.map((root) => walkLogs(root)));
  return nested.flat().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listTeacherLogs(teacherId: string) {
  const logs = await listAllLogs();
  const teacherPathFragment = `teachers/teacher_${teacherId}/`;

  return logs.filter((entry) => entry.relativePath.includes(teacherPathFragment));
}

export async function readLogFile(sourceKey: string, relativePath: string) {
  const source = LOG_ROOTS.find((item) => item.key === sourceKey);
  if (!source) {
    throw new Error("Unknown log source");
  }

  const normalizedPath = normalizeRelativePath(relativePath);
  const absolutePath = path.join(source.path, normalizedPath);
  const rootPath = path.resolve(source.path);
  const resolvedPath = path.resolve(absolutePath);

  if (!resolvedPath.startsWith(rootPath)) {
    throw new Error("Invalid log path");
  }

  return fs.readFile(resolvedPath, "utf8");
}
