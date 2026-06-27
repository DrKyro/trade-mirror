import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import type { TeacherAccountSnapshot } from "#/lib/trading/adapters/platform-adapter";
import { getAdapter } from "#/lib/trading/adapters/registry";
import type { TeacherRecord } from "#/lib/trading/types";

export type { TeacherAccountSnapshot };

export async function fetchTeacherAccountSnapshot(teacher: TeacherRecord) {
  const adapter = getAdapter(teacher.platform);
  if (!adapter.fetchTeacherAccount) {
    throw new Error(`Teacher account refresh is not supported yet for ${teacher.platform}`);
  }
  return adapter.fetchTeacherAccount(teacher.credentials);
}
