import { executeTeacherChange } from "#/lib/trading/execution/execution-service";
import type {
  ExecutionServiceResult,
  FollowOrderRelation,
  PositionChange,
  PositionSnapshot,
  TeacherPositionHistoryEntry,
  TeacherRecord,
  TraceTraderSetting,
  TraderRecord,
} from "#/lib/trading/types";

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

const EQUITY_HISTORY_LIMIT = 1_440;
const POSITION_HISTORY_LIMIT = 800;

export function clonePosition(position: PositionSnapshot): PositionSnapshot {
  return { ...position };
}

export function cloneTrader(trader: TraderRecord): TraderRecord {
  return {
    ...trader,
    positions: trader.positions.map(clonePosition),
  };
}

export function cloneTeacher(teacher: TeacherRecord): TeacherRecord {
  return {
    ...teacher,
    positions: teacher.positions.map(clonePosition),
    teacherPositions: teacher.teacherPositions.map(clonePosition),
    followRelations: teacher.followRelations.map((relation) => ({ ...relation })),
    traceTraderList: teacher.traceTraderList.map((setting) => ({ ...setting })),
    settings: { ...teacher.settings },
    equityHistory: {
      min: teacher.equityHistory.min.map((point) => ({ ...point })),
      hour: teacher.equityHistory.hour.map((point) => ({ ...point })),
      day: teacher.equityHistory.day.map((point) => ({ ...point })),
    },
    positionHistory: teacher.positionHistory.map((entry) => ({ ...entry })),
  };
}

function pushBounded<T>(list: T[], item: T, limit: number) {
  list.push(item);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

function recordEquitySnapshot(teacher: TeacherRecord, now = Date.now()) {
  const point = {
    t: now,
    e: round(teacher.equity, 4),
  };

  if (now % (5 * 60_000) < 1_000 || teacher.equityHistory.min.length === 0) {
    pushBounded(teacher.equityHistory.min, point, EQUITY_HISTORY_LIMIT);
  }
  if (now % (60 * 60_000) < 1_000 || teacher.equityHistory.hour.length === 0) {
    pushBounded(teacher.equityHistory.hour, point, EQUITY_HISTORY_LIMIT);
  }

  const current = new Date(now);
  if (
    (current.getHours() === 0 && current.getMinutes() < 1) ||
    teacher.equityHistory.day.length === 0
  ) {
    pushBounded(teacher.equityHistory.day, point, EQUITY_HISTORY_LIMIT);
  }
}

function appendTeacherPositionHistory(teacher: TeacherRecord, entry: TeacherPositionHistoryEntry) {
  pushBounded(teacher.positionHistory, entry, POSITION_HISTORY_LIMIT);
}

function buildHistoryPs(execution: ExecutionServiceResult | null, fallback: string) {
  const notes = execution?.notes?.filter(Boolean) ?? [];
  return notes.length > 0 ? notes.join(" | ") : fallback;
}

function getRequestedChangeAmount(change: PositionChange) {
  if (change.added || change.removed) {
    return round(change.amount, 6);
  }

  if (change.amountChange !== undefined) {
    return round(Math.abs(change.amountChange), 6);
  }

  return round(change.amount, 6);
}

function isAmountIncrease(change: PositionChange) {
  return !change.added && !change.removed && (change.amountChange ?? 0) > 0;
}

function isAmountDecrease(change: PositionChange) {
  return !change.added && !change.removed && (change.amountChange ?? 0) < 0;
}

function recordRiskRejection(
  teacher: TeacherRecord,
  trader: TraderRecord,
  change: PositionChange,
  ps: string,
) {
  appendTeacherPositionHistory(teacher, {
    t: Date.now(),
    orderId: null,
    symbol: change.symbol,
    side: change.positionSide,
    amount: getRequestedChangeAmount(change),
    price: round(change.entryPrice, 6),
    profit: 0,
    traderId: trader.id,
    action: 1,
    success: -1,
    ps,
  });
}

export function detectPositionChanges(
  previous: PositionSnapshot[],
  current: PositionSnapshot[],
): PositionChange[] {
  const changes: PositionChange[] = [];
  const previousById = new Map(previous.map((position) => [position.id, position]));

  for (const previousPosition of previous) {
    const currentPosition = current.find((item) => item.id === previousPosition.id);
    if (!currentPosition) {
      changes.push({
        ...previousPosition,
        removed: true,
        message: `${previousPosition.symbol} ${previousPosition.positionSide === "long" ? "平多" : "平空"}`,
      });
      continue;
    }

    if (previousPosition.amount !== currentPosition.amount) {
      const previousAbs = Math.abs(previousPosition.amount);
      const currentAbs = Math.abs(currentPosition.amount);
      const action = previousAbs < currentAbs ? "加仓" : "减仓";
      const side = previousPosition.positionSide === "long" ? "做多" : "做空";

      changes.push({
        ...currentPosition,
        amountChange: round(currentPosition.amount - previousPosition.amount),
        message: `仓位${previousPosition.symbol}${side}${action}了${round(
          currentPosition.amount - previousPosition.amount,
        )}个`,
      });
    }
  }

  for (const currentPosition of current) {
    if (previousById.has(currentPosition.id)) {
      continue;
    }

    changes.push({
      ...currentPosition,
      added: true,
      message: `${currentPosition.symbol} ${currentPosition.positionSide === "long" ? "开多" : "开空"}`,
    });
  }

  return changes;
}

function ensureTraceSetting(
  teacher: TeacherRecord,
  trader: TraderRecord,
): TraceTraderSetting | undefined {
  const existing = teacher.traceTraderList.find((setting) => setting.id === trader.id);
  if (existing) {
    return existing;
  }

  if (trader.strategyStatus !== "follow") {
    return undefined;
  }

  const newSetting: TraceTraderSetting = {
    id: trader.id,
    name: trader.name,
    funds: 0,
    traceOrderMode: "ratio",
    fixedFunds: 0,
    tracePerRatio: 0,
    stopLossUsdt: 0,
    stopLossPositionValueRate: 0,
    followStatus: "following",
    unrealizedProfitSum: 0,
    followProfit: 0,
  };
  teacher.traceTraderList.push(newSetting);
  return newSetting;
}

function getActiveRiskRatio(teacher: TeacherRecord) {
  const activeTraderIds = new Set(
    teacher.followRelations.map((relation) => relation.followTraderId),
  );

  return teacher.traceTraderList.reduce((sum, setting) => {
    if (!activeTraderIds.has(setting.id)) {
      return sum;
    }
    if (!setting.stopLossUsdt || !teacher.equity) {
      return sum;
    }
    return sum + setting.stopLossUsdt / teacher.equity;
  }, 0);
}

function passesCreateOrderCheck(
  teacher: TeacherRecord,
  trader: TraderRecord,
  change: PositionChange,
): { ok: true } | { ok: false; ps: string } {
  if (teacher.settings.safeMarginRate > 0) {
    const marginRate = teacher.balance === 0 ? 0 : teacher.freeUsdt / teacher.balance;
    if (marginRate < teacher.settings.safeMarginRate) {
      return {
        ok: false,
        ps: `权益低于最低开仓保证金限制，当前可用保证金率:${round(marginRate, 6)}`,
      };
    }
  }

  if (teacher.settings.limitRiskRatio > 0) {
    const existingForTrader = teacher.followRelations.filter(
      (relation) => relation.followTraderId === trader.id,
    );
    if (existingForTrader.length === 0) {
      const currentRisk = getActiveRiskRatio(teacher);
      if (currentRisk > teacher.settings.limitRiskRatio) {
        return {
          ok: false,
          ps: `当前风险率大于最大风险率限制，停止开仓 nowRiskRatio:${round(currentRisk, 6)}`,
        };
      }
    }
  }

  if (!(change.amount > 0)) {
    return {
      ok: false,
      ps: "开仓数量小于等于 0，跳过执行",
    };
  }

  return { ok: true };
}

function createTeacherPosition(relation: FollowOrderRelation, leverage: number): PositionSnapshot {
  const margin = (relation.openAvgPrice * relation.amount) / leverage;
  const pnlRatio =
    relation.markPrice && relation.openAvgPrice
      ? relation.unrealizedProfit / (relation.openAvgPrice * relation.amount)
      : 0;

  return {
    id: relation.orderId,
    symbol: relation.symbol,
    entryPrice: relation.openAvgPrice,
    markPrice: relation.markPrice,
    amount: relation.amount,
    leverage,
    openTime: relation.openTime,
    closeTime: null,
    margin,
    marginMode: "cross",
    pnl: relation.unrealizedProfit,
    pnlRatio,
    positionSide: relation.positionSide,
    closeAvgPrice: null,
    contractValue: null,
  };
}

function syncTeacherComputedFields(teacher: TeacherRecord) {
  const hasLiveAccountSnapshot =
    teacher.executionMode === "live" &&
    (teacher.balance !== 0 ||
      teacher.equity !== 0 ||
      teacher.freeUsdt !== 0 ||
      teacher.unrealizedPnl !== 0 ||
      teacher.teacherPositions.length > 0);

  teacher.traceTraderList = teacher.traceTraderList.map((setting) => {
    const unrealizedProfitSum = teacher.followRelations
      .filter((relation) => relation.followTraderId === setting.id)
      .reduce((sum, relation) => sum + relation.unrealizedProfit, 0);

    return {
      ...setting,
      unrealizedProfitSum: round(unrealizedProfitSum, 4),
    };
  });

  teacher.positions = teacher.followRelations.map((relation) =>
    createTeacherPosition(relation, 20),
  );

  if (!hasLiveAccountSnapshot) {
    teacher.teacherPositions = teacher.positions.map(clonePosition);
    teacher.unrealizedPnl = round(
      teacher.followRelations.reduce((sum, relation) => sum + relation.unrealizedProfit, 0),
      4,
    );
    teacher.equity = round(teacher.balance + teacher.unrealizedPnl, 4);
  }

  teacher.maxRiskRatio = round(
    teacher.traceTraderList.reduce((sum, setting) => {
      if (!setting.stopLossUsdt || !teacher.equity) {
        return sum;
      }
      return sum + setting.stopLossUsdt / teacher.equity;
    }, 0),
    6,
  );
  teacher.nowRiskRatio = round(getActiveRiskRatio(teacher), 6);
}

function stopLossCheck(teacher: TeacherRecord) {
  for (const setting of teacher.traceTraderList) {
    if (!(setting.stopLossUsdt > 0)) {
      continue;
    }

    if (setting.unrealizedProfitSum < -setting.stopLossUsdt) {
      teacher.followRelations = teacher.followRelations.filter((relation) => {
        const shouldClose = relation.followTraderId === setting.id;
        if (shouldClose) {
          setting.followStatus = "unfollow";
          setting.followProfit = round(setting.followProfit + relation.unrealizedProfit, 4);
        }
        return !shouldClose;
      });
    }
  }

  for (const relation of [...teacher.followRelations]) {
    const setting = teacher.traceTraderList.find((item) => item.id === relation.followTraderId);
    if (!setting || !setting.stopLossPositionValueRate) {
      continue;
    }

    const entryValue = relation.openAvgPrice * relation.amount;
    const ratio = entryValue === 0 ? 0 : relation.unrealizedProfit / entryValue;
    if (ratio < -setting.stopLossPositionValueRate) {
      setting.followProfit = round(setting.followProfit + relation.unrealizedProfit, 4);
      teacher.followRelations = teacher.followRelations.filter(
        (item) => item.orderId !== relation.orderId,
      );
    }
  }
}

export async function applyPositionChangeToTeacher(
  teacher: TeacherRecord,
  trader: TraderRecord,
  change: PositionChange,
) {
  const traceSetting = ensureTraceSetting(teacher, trader);
  if (!traceSetting) {
    return;
  }

  if (traceSetting.followStatus === "unfollow") {
    return;
  }

  if (change.added || isAmountIncrease(change)) {
    if (!teacher.settings.accountMaxRiskRate) {
      recordRiskRejection(teacher, trader, change, "未配置 accountMaxRiskRate，跳过开仓");
      return;
    }

    const createCheck = passesCreateOrderCheck(teacher, trader, change);
    if (!createCheck.ok) {
      recordRiskRejection(teacher, trader, change, createCheck.ps);
      return;
    }

    const existingForTrader = teacher.followRelations.filter(
      (relation) => relation.followTraderId === trader.id,
    );
    if (existingForTrader.length === 0) {
      const strategyRiskUsdt =
        teacher.equity * teacher.settings.accountMaxRiskRate * trader.strategyRiskRate;
      const ratio =
        trader.threeMonthMaxDrawdown === 0 ? 0 : -(strategyRiskUsdt / trader.threeMonthMaxDrawdown);

      traceSetting.tracePerRatio = round(Math.max(ratio, 0), 6);
      traceSetting.stopLossUsdt = round(strategyRiskUsdt, 4);
    }

    const execution = await executeTeacherChange({
      teacher,
      trader,
      change,
      traceSetting,
      existingRelations: teacher.followRelations,
    });

    const fill = execution?.createdFill ?? null;
    if (!fill || !(fill.amount > 0)) {
      appendTeacherPositionHistory(teacher, {
        t: Date.now(),
        orderId: null,
        symbol: change.symbol,
        side: change.positionSide,
        amount: getRequestedChangeAmount(change),
        price: round(change.entryPrice, 6),
        profit: 0,
        traderId: trader.id,
        action: 1,
        success: 0,
        ps: buildHistoryPs(execution, "执行服务未返回可用开仓成交"),
      });
      return;
    }

    const relation: FollowOrderRelation = {
      orderId: fill.orderId,
      followOrderId: fill.followOrderId,
      followTraderId: trader.id,
      symbol: fill.symbol,
      amount: fill.amount,
      positionSide: fill.positionSide,
      openAvgPrice: fill.openAvgPrice,
      markPrice: change.markPrice ?? change.entryPrice,
      unrealizedProfit: 0,
      updateTime: Date.now(),
      openTime: fill.openTime ?? Date.now(),
    };

    if (teacher.platform === "binance") {
      const existing = teacher.followRelations.find(
        (item) =>
          item.followTraderId === relation.followTraderId &&
          item.symbol === relation.symbol &&
          item.positionSide === relation.positionSide,
      );
      if (existing) {
        existing.openAvgPrice = round(
          (existing.amount * existing.openAvgPrice + relation.amount * relation.openAvgPrice) /
            (existing.amount + relation.amount),
          6,
        );
        existing.amount = round(existing.amount + relation.amount, 6);
      } else {
        teacher.followRelations.push(relation);
      }
    } else {
      teacher.followRelations.push(relation);
    }

    appendTeacherPositionHistory(teacher, {
      t: fill.openTime ?? Date.now(),
      orderId: fill.orderId,
      symbol: fill.symbol,
      side: fill.positionSide,
      amount: round(fill.amount, 6),
      price: round(fill.openAvgPrice, 6),
      profit: 0,
      traderId: trader.id,
      action: 1,
      success: 1,
      ps: buildHistoryPs(execution, "created position"),
    });
  }

  if (change.removed || isAmountDecrease(change)) {
    const execution = await executeTeacherChange({
      teacher,
      trader,
      change,
      traceSetting,
      existingRelations: teacher.followRelations,
    });

    const closeFills = execution?.closeFills ?? [];
    if (closeFills.length === 0) {
      appendTeacherPositionHistory(teacher, {
        t: Date.now(),
        orderId: null,
        symbol: change.symbol,
        side: change.positionSide,
        amount: getRequestedChangeAmount(change),
        price: round(change.markPrice ?? change.entryPrice, 6),
        profit: 0,
        traderId: trader.id,
        action: 0,
        success: 0,
        ps: buildHistoryPs(execution, "执行服务未返回可用平仓成交"),
      });
      return;
    }
    const closeFillByOrderId = new Map(closeFills.map((fill) => [fill.orderId, fill] as const));

    teacher.followRelations = teacher.followRelations.filter((relation) => {
      const closeFill = closeFillByOrderId.get(relation.orderId);
      if (!closeFill) {
        return true;
      }

      const previousAmount = relation.amount;
      const realizedProfit = round(
        previousAmount === 0
          ? relation.unrealizedProfit
          : relation.unrealizedProfit * (closeFill.closedAmount / previousAmount),
        4,
      );

      appendTeacherPositionHistory(teacher, {
        t: closeFill.closeTime ?? Date.now(),
        orderId: relation.orderId,
        symbol: relation.symbol,
        side: relation.positionSide,
        amount: round(closeFill.closedAmount, 6),
        price: round(relation.markPrice, 6),
        profit: realizedProfit,
        traderId: relation.followTraderId,
        action: 0,
        success: 1,
        ps: buildHistoryPs(execution, "closed position"),
      });

      traceSetting.followProfit = round(traceSetting.followProfit + realizedProfit, 4);

      const remainingAmount = round(previousAmount - closeFill.closedAmount, 6);
      if (remainingAmount > 0) {
        relation.amount = remainingAmount;
        relation.unrealizedProfit = round(relation.unrealizedProfit - realizedProfit, 4);
        relation.updateTime = closeFill.closeTime ?? Date.now();
        return true;
      }

      return false;
    });
  }

  teacher.lastSignalAt = Date.now();
  syncTeacherComputedFields(teacher);
  stopLossCheck(teacher);
  syncTeacherComputedFields(teacher);
  recordEquitySnapshot(teacher, teacher.lastSignalAt);
}

export function updateTeacherMarksFromTraders(teacher: TeacherRecord, traders: TraderRecord[]) {
  for (const relation of teacher.followRelations) {
    const trader = traders.find((item) => item.id === relation.followTraderId);
    const traderPosition = trader?.positions.find(
      (position) =>
        position.symbol === relation.symbol && position.positionSide === relation.positionSide,
    );

    if (!traderPosition?.markPrice) {
      continue;
    }

    relation.markPrice = traderPosition.markPrice;
    relation.unrealizedProfit =
      relation.positionSide === "long"
        ? round((relation.markPrice - relation.openAvgPrice) * relation.amount, 4)
        : round((relation.openAvgPrice - relation.markPrice) * relation.amount, 4);
    relation.updateTime = Date.now();
  }

  syncTeacherComputedFields(teacher);
  stopLossCheck(teacher);
  syncTeacherComputedFields(teacher);
  recordEquitySnapshot(teacher);
}
