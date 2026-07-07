import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import { getAdapter } from "#/lib/trading/adapters/registry";
import { isExchangeBackedMode } from "#/lib/trading/execution-mode";
import { DEMO_TEACHER_PLATFORMS } from "#/lib/trading/follow-platform";
import type {
  CloseFill,
  ExecutionFill,
  ExecutionRequest,
  ExecutionServiceResult,
  FollowOrderRelation,
  PositionChange,
  TeacherRecord,
} from "#/lib/trading/types";

function now() {
  return Date.now();
}

function deriveTracedAmount(request: ExecutionRequest) {
  const setting = request.traceSetting;
  if (setting.traceOrderMode === "fixed") {
    return setting.fixedFunds;
  }
  return Number(((request.change.amount * setting.tracePerRatio) / 100).toFixed(6));
}

function isAmountIncrease(change: PositionChange) {
  return change.amountChange !== undefined && change.amountChange > 0;
}

function isAmountDecrease(change: PositionChange) {
  return change.amountChange !== undefined && change.amountChange < 0;
}

function getOrderClassMatches(request: ExecutionRequest) {
  return request.existingRelations.filter(
    (relation) => relation.followOrderId === request.change.id,
  );
}

function getPlatformClass(platform: TeacherRecord["platform"]) {
  return platform === "binanceFutures" ? "amountClass" : "orderClass";
}

function getExchangeOrderMeta(change: PositionChange) {
  return {
    leverage: change.leverage,
    marginMode: change.marginMode,
  };
}

function supportsExchangePartialClose(platform: TeacherRecord["platform"]) {
  return DEMO_TEACHER_PLATFORMS.includes(platform);
}

function createDryRunFill(
  request: ExecutionRequest,
  platformClass: ExecutionServiceResult["platformClass"],
) {
  const tracedAmount = deriveTracedAmount(request);
  if (!(tracedAmount > 0)) return null;

  return {
    mode: request.teacher.executionMode ?? "dry-run",
    platformClass,
    createdFill: {
      orderId: `exec-${request.teacher.id}-${request.change.id}-${now()}`,
      followOrderId: request.change.id,
      symbol: request.change.symbol,
      amount: tracedAmount,
      positionSide: request.change.positionSide,
      openAvgPrice: request.change.entryPrice,
      openTime: now(),
    },
    notes: ["dry-run create execution generated"],
  } satisfies ExecutionServiceResult;
}

async function createLiveOrder(request: ExecutionRequest, amount: number) {
  const adapter = getAdapter(request.teacher.platform);
  if (!adapter.createLiveOrder) return null;
  return adapter.createLiveOrder({
    credentials: request.teacher.credentials,
    executionMode: request.teacher.executionMode,
    symbol: request.change.symbol,
    amount,
    positionSide: request.change.positionSide,
    followOrderId: request.change.id,
    ...getExchangeOrderMeta(request.change),
  });
}

async function closeLiveOrderForRelation(
  request: ExecutionRequest,
  relation: FollowOrderRelation,
  amount: number,
) {
  const adapter = getAdapter(request.teacher.platform);
  if (!adapter.closeLiveOrder) {
    return {
      orderId: relation.orderId,
      closedAmount: amount,
      closeTime: Date.now(),
    } satisfies CloseFill;
  }

  return adapter.closeLiveOrder({
    credentials: request.teacher.credentials,
    executionMode: request.teacher.executionMode,
    orderId: relation.orderId,
    symbol: relation.symbol,
    amount,
    positionSide: relation.positionSide,
    ...getExchangeOrderMeta(request.change),
  });
}

async function closeLiveOrders(
  request: ExecutionRequest,
  platformClass: "orderClass" | "amountClass",
) {
  if (platformClass === "amountClass" && request.teacher.platform === "binanceFutures") {
    const tracedAmount = deriveTracedAmount(request);
    const matching = request.existingRelations.filter(
      (relation) =>
        relation.followTraderId === request.trader.id &&
        relation.symbol === request.change.symbol &&
        relation.positionSide === request.change.positionSide,
    );

    return Promise.all(
      matching.map((relation) =>
        closeLiveOrderForRelation(request, relation, Math.min(relation.amount, tracedAmount)),
      ),
    );
  }

  const matching = getOrderClassMatches(request);
  return Promise.all(
    matching.map((relation) => closeLiveOrderForRelation(request, relation, relation.amount)),
  );
}

function closePartialForOrderClass(
  request: ExecutionRequest,
  mode: ExecutionServiceResult["mode"],
) {
  const matching = getOrderClassMatches(request);
  let remaining = deriveTracedAmount(request);
  const closeFills: CloseFill[] = [];

  for (const relation of matching) {
    if (!(remaining > 0)) break;
    const closedAmount = Number(Math.min(relation.amount, remaining).toFixed(6));
    if (!(closedAmount > 0)) continue;
    closeFills.push({ orderId: relation.orderId, closedAmount, closeTime: now() });
    remaining = Number(Math.max(remaining - closedAmount, 0).toFixed(6));
  }

  const notes = ["dry-run partial order-class close generated"];
  if (remaining > 0) notes.push(`partial close left ${remaining} amount unmatched`);

  return {
    mode,
    platformClass: "orderClass" as const,
    closeFills,
    notes,
  } satisfies ExecutionServiceResult;
}

async function closeLiveOrdersForAmountDecrease(
  request: ExecutionRequest,
  platformClass: "orderClass" | "amountClass",
): Promise<{ closeFills: CloseFill[]; notes: string[] }> {
  if (platformClass === "amountClass" && request.teacher.platform === "binanceFutures") {
    const matching = request.existingRelations.filter(
      (relation) =>
        relation.followTraderId === request.trader.id &&
        relation.symbol === request.change.symbol &&
        relation.positionSide === request.change.positionSide,
    );
    let remaining = deriveTracedAmount(request);
    const closeFills: CloseFill[] = [];

    for (const relation of matching) {
      if (!(remaining > 0)) break;
      const closedAmount = Number(Math.min(relation.amount, remaining).toFixed(6));
      if (!(closedAmount > 0)) continue;
      const fill = await closeLiveOrderForRelation(request, relation, closedAmount);
      closeFills.push(fill);
      remaining = Number(Math.max(remaining - closedAmount, 0).toFixed(6));
    }

    const notes: string[] = [];
    if (remaining > 0) notes.push(`partial close left ${remaining} amount unmatched`);
    return { closeFills, notes };
  }

  if (
    platformClass === "orderClass" &&
    request.teacher.platform === "okx" &&
    supportsExchangePartialClose(request.teacher.platform)
  ) {
    const matching = getOrderClassMatches(request);
    let remaining = deriveTracedAmount(request);
    const closeFills: CloseFill[] = [];

    for (const relation of matching) {
      if (!(remaining > 0)) break;
      const closedAmount = Number(Math.min(relation.amount, remaining).toFixed(6));
      if (!(closedAmount > 0)) continue;
      const fill = await closeLiveOrderForRelation(request, relation, closedAmount);
      closeFills.push(fill);
      remaining = Number(Math.max(remaining - closedAmount, 0).toFixed(6));
    }

    const notes: string[] = [];
    if (remaining > 0) notes.push(`partial close left ${remaining} amount unmatched`);
    return { closeFills, notes };
  }

  const fallback = closePartialForOrderClass(request, request.teacher.executionMode ?? "dry-run");
  return { closeFills: fallback.closeFills ?? [], notes: fallback.notes ?? [] };
}

export async function executePositionChange(
  request: ExecutionRequest,
): Promise<ExecutionServiceResult | null> {
  const platformClass = getPlatformClass(request.teacher.platform);
  const mode = request.teacher.executionMode ?? "dry-run";
  const adapter = getAdapter(request.teacher.platform);
  const supportsLive = typeof adapter.createLiveOrder === "function";

  if (request.change.added || isAmountIncrease(request.change)) {
    if (isExchangeBackedMode(mode) && supportsLive) {
      const tracedAmount = deriveTracedAmount(request);
      if (!(tracedAmount > 0)) {
        return {
          mode,
          platformClass,
          notes: [`${mode} create skipped because traced amount <= 0`],
        };
      }
      const fill = await createLiveOrder(request, tracedAmount);
      if (!fill) {
        return {
          mode,
          platformClass,
          notes: [`${request.teacher.platform} ${mode} create order returned no fill`],
        };
      }
      return {
        mode,
        platformClass,
        createdFill: fill,
        notes: [`${request.teacher.platform} ${mode} create order executed`],
      };
    }
    return createDryRunFill(request, platformClass);
  }

  if (request.change.removed || isAmountDecrease(request.change)) {
    if (isExchangeBackedMode(mode) && supportsLive) {
      const closeResult = isAmountDecrease(request.change)
        ? await closeLiveOrdersForAmountDecrease(request, platformClass)
        : { closeFills: await closeLiveOrders(request, platformClass), notes: [] as string[] };
      return {
        mode,
        platformClass,
        closeFills: closeResult.closeFills,
        notes: [`${request.teacher.platform} ${mode} close order executed`, ...closeResult.notes],
      };
    }

    return closePartialForOrderClass(request, mode);
  }

  return null;
}

export type { ExecutionRequest, ExecutionServiceResult, ExecutionFill, CloseFill };

export const executeTeacherChange = executePositionChange;
