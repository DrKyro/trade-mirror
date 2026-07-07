import type {
  TeacherRecord,
  TraceTraderSetting,
  TraderPlatform,
  TraderRecord,
} from "#/lib/trading/types";

/** Platforms supported for exchange demo (模拟盘) follow accounts. */
export const DEMO_TEACHER_PLATFORMS: TraderPlatform[] = ["okx", "binanceFutures"];

export function teacherPlatformMatchesTrader(
  teacherPlatform: TeacherRecord["platform"],
  traderPlatform: TraderRecord["platform"],
) {
  return teacherPlatform === traderPlatform;
}

export function filterTradersForTeacherPlatform<T extends Pick<TraderRecord, "id" | "platform">>(
  traders: T[],
  teacherPlatform: TeacherRecord["platform"],
) {
  return traders.filter((trader) => teacherPlatformMatchesTrader(teacherPlatform, trader.platform));
}

export function findPlatformMismatchedTrader(
  teacher: Pick<TeacherRecord, "platform">,
  traceTraderList: TraceTraderSetting[],
  traders: TraderRecord[],
) {
  for (const setting of traceTraderList) {
    const trader = traders.find((item) => item.id === setting.id);
    if (trader && !teacherPlatformMatchesTrader(teacher.platform, trader.platform)) {
      return { trader, setting };
    }
  }
  return null;
}

export function assertTraceTradersMatchTeacherPlatform(
  teacher: Pick<TeacherRecord, "platform" | "name">,
  traceTraderList: TraceTraderSetting[],
  traders: TraderRecord[],
) {
  const mismatch = findPlatformMismatchedTrader(teacher, traceTraderList, traders);
  if (!mismatch) {
    return;
  }

  throw new Error(
    `Cannot follow ${mismatch.trader.name} (${mismatch.trader.platform}) on ${teacher.name} (${teacher.platform}). Demo accounts must use the same exchange as the lead trader.`,
  );
}
