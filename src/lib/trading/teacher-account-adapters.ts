import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import type { TeacherAccountSnapshot } from "#/lib/trading/adapters/platform-adapter";
import { getAdapter } from "#/lib/trading/adapters/registry";
import type {
  ExecutionMode,
  TeacherCredentials,
  TeacherRecord,
  TraderPlatform,
} from "#/lib/trading/types";

export type { TeacherAccountSnapshot };

export interface TeacherAccountProbeResult {
  ok: boolean;
  balance?: number;
  equity?: number;
  positionCount?: number;
  error?: string;
}

export async function fetchTeacherAccountSnapshot(teacher: TeacherRecord) {
  const adapter = getAdapter(teacher.platform);
  if (!adapter.fetchTeacherAccount) {
    throw new Error(`Teacher account refresh is not supported yet for ${teacher.platform}`);
  }
  return adapter.fetchTeacherAccount({
    credentials: teacher.credentials,
    executionMode: teacher.executionMode,
  });
}

export async function probeTeacherAccount(input: {
  platform: TraderPlatform;
  credentials: TeacherCredentials;
  executionMode?: ExecutionMode;
}): Promise<TeacherAccountProbeResult> {
  const adapter = getAdapter(input.platform);
  if (!adapter.fetchTeacherAccount) {
    return {
      ok: false,
      error: `Teacher account probe is not supported yet for ${input.platform}`,
    };
  }

  try {
    const snapshot = await adapter.fetchTeacherAccount({
      credentials: input.credentials,
      executionMode: input.executionMode ?? "demo",
    });
    return {
      ok: true,
      balance: snapshot.balance,
      equity: snapshot.equity,
      positionCount: snapshot.teacherPositions.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
