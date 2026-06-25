import "@tanstack/react-start/server-only";
import {
  closeBinanceLiveOrder,
  createBinanceLiveOrder,
} from "#/lib/trading/execution/binance-execution-adapter";
import {
  closeBitgetLiveOrder,
  createBitgetLiveOrder,
} from "#/lib/trading/execution/bitget-execution-adapter";
import {
  closeHuobiLiveOrder,
  createHuobiLiveOrder,
} from "#/lib/trading/execution/huobi-execution-adapter";
import {
  closeOkxLiveOrder,
  createOkxLiveOrder,
} from "#/lib/trading/execution/okx-execution-adapter";
import type {
  CloseFill,
  ExecutionRequest,
  ExecutionServiceResult,
  TeacherRecord,
} from "#/lib/trading/types";

function now() {
  return Date.now();
}

function isAmountIncrease(request: ExecutionRequest) {
  return !request.change.added && !request.change.removed && (request.change.amountChange ?? 0) > 0;
}

function isAmountDecrease(request: ExecutionRequest) {
  return !request.change.added && !request.change.removed && (request.change.amountChange ?? 0) < 0;
}

function getSignalAmount(request: ExecutionRequest) {
  if (request.change.added || request.change.removed) {
    return Math.abs(request.change.amount);
  }

  if (request.change.amountChange !== undefined) {
    return Math.abs(request.change.amountChange);
  }

  return Math.abs(request.change.amount);
}

function deriveTracedAmount(request: ExecutionRequest) {
  if (request.traceSetting.traceOrderMode === "fixed") {
    return Number(
      ((request.traceSetting.fixedFunds / Math.max(request.change.entryPrice, 1)) * 20).toFixed(6),
    );
  }

  return Number((getSignalAmount(request) * request.traceSetting.tracePerRatio).toFixed(6));
}

function closeForAmountClass(request: ExecutionRequest, mode: ExecutionServiceResult["mode"]) {
  const tracedAmount = deriveTracedAmount(request);
  const matches = request.existingRelations.filter(
    (relation) =>
      relation.followTraderId === request.trader.id &&
      relation.symbol === request.change.symbol &&
      relation.positionSide === request.change.positionSide,
  );

  const fills: CloseFill[] = matches.map((relation) => ({
    orderId: relation.orderId,
    closedAmount: Number(Math.min(relation.amount, tracedAmount).toFixed(6)),
    closeTime: now(),
  }));

  return {
    mode,
    platformClass: "amountClass",
    closeFills: fills,
    notes: [
      mode === "live"
        ? "live execution for amount-class close is not wired yet; fill shape is reserved"
        : "dry-run amount-class close generated",
    ],
  } satisfies ExecutionServiceResult;
}

function getOrderClassMatches(request: ExecutionRequest) {
  return request.existingRelations
    .filter(
      (relation) =>
        relation.followOrderId === request.change.id &&
        relation.symbol === request.change.symbol &&
        relation.positionSide === request.change.positionSide,
    )
    .sort((left, right) => (right.openTime ?? 0) - (left.openTime ?? 0));
}

function closeForOrderClass(request: ExecutionRequest, mode: ExecutionServiceResult["mode"]) {
  const matching = getOrderClassMatches(request);

  return {
    mode,
    platformClass: "orderClass",
    closeFills: matching.map((relation) => ({
      orderId: relation.orderId,
      closedAmount: relation.amount,
      closeTime: now(),
    })),
    notes: [
      mode === "live"
        ? "live execution for order-class close is not wired yet; fill shape is reserved"
        : "dry-run order-class close generated",
    ],
  } satisfies ExecutionServiceResult;
}

function closePartialForOrderClass(
  request: ExecutionRequest,
  mode: ExecutionServiceResult["mode"],
) {
  const matching = getOrderClassMatches(request);
  let remaining = deriveTracedAmount(request);
  const closeFills: CloseFill[] = [];

  for (const relation of matching) {
    if (!(remaining > 0)) {
      break;
    }

    const closedAmount = Number(Math.min(relation.amount, remaining).toFixed(6));
    if (!(closedAmount > 0)) {
      continue;
    }

    closeFills.push({
      orderId: relation.orderId,
      closedAmount,
      closeTime: now(),
    });
    remaining = Number(Math.max(remaining - closedAmount, 0).toFixed(6));
  }

  const notes = [
    mode === "live"
      ? "live execution for partial order-class close is not wired yet; fill shape is reserved"
      : "dry-run partial order-class close generated",
  ];

  if (remaining > 0) {
    notes.push(`partial close left ${remaining} amount unmatched`);
  }

  return {
    mode,
    platformClass: "orderClass",
    closeFills,
    notes,
  } satisfies ExecutionServiceResult;
}

function createDryRunFill(
  request: ExecutionRequest,
  platformClass: ExecutionServiceResult["platformClass"],
) {
  const tracedAmount = deriveTracedAmount(request);

  if (!(tracedAmount > 0)) {
    return null;
  }

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
    notes: [
      request.teacher.executionMode === "live"
        ? "live create execution adapter placeholder used; no exchange order was sent"
        : "dry-run create execution generated",
    ],
  } satisfies ExecutionServiceResult;
}

function getPlatformClass(platform: TeacherRecord["platform"]) {
  return platform === "binance" ? "amountClass" : "orderClass";
}

async function createLiveOrder(request: ExecutionRequest, amount: number) {
  switch (request.teacher.platform) {
    case "bitget":
      return createBitgetLiveOrder({
        credentials: request.teacher.credentials,
        symbol: request.change.symbol,
        amount,
        positionSide: request.change.positionSide,
        followOrderId: request.change.id,
      });
    case "okx":
      return createOkxLiveOrder({
        credentials: request.teacher.credentials,
        symbol: request.change.symbol,
        amount,
        positionSide: request.change.positionSide,
        followOrderId: request.change.id,
      });
    case "binance":
      return createBinanceLiveOrder({
        credentials: request.teacher.credentials,
        symbol: request.change.symbol,
        amount,
        positionSide: request.change.positionSide,
        followOrderId: request.change.id,
      });
    case "huobi":
      return createHuobiLiveOrder({
        credentials: request.teacher.credentials,
        symbol: request.change.symbol,
        amount,
        positionSide: request.change.positionSide,
        followOrderId: request.change.id,
      });
    default:
      return null;
  }
}

async function closeLiveOrders(
  request: ExecutionRequest,
  platformClass: "orderClass" | "amountClass",
) {
  if (platformClass === "amountClass" && request.teacher.platform === "binance") {
    const tracedAmount = deriveTracedAmount(request);
    const matching = request.existingRelations.filter(
      (relation) =>
        relation.followTraderId === request.trader.id &&
        relation.symbol === request.change.symbol &&
        relation.positionSide === request.change.positionSide,
    );

    return Promise.all(
      matching.map((relation) =>
        closeBinanceLiveOrder({
          credentials: request.teacher.credentials,
          orderId: relation.orderId,
          symbol: relation.symbol,
          amount: Math.min(relation.amount, tracedAmount),
          positionSide: relation.positionSide,
        }),
      ),
    );
  }

  const matching = request.existingRelations.filter(
    (relation) => relation.followOrderId === request.change.id,
  );

  return Promise.all(
    matching.map((relation) => {
      switch (request.teacher.platform) {
        case "bitget":
          return closeBitgetLiveOrder({
            credentials: request.teacher.credentials,
            orderId: relation.orderId,
            symbol: relation.symbol,
            amount: relation.amount,
          });
        case "okx":
          return closeOkxLiveOrder({
            credentials: request.teacher.credentials,
            orderId: relation.orderId,
            symbol: relation.symbol,
            amount: relation.amount,
            positionSide: relation.positionSide,
          });
        case "huobi":
          return closeHuobiLiveOrder({
            credentials: request.teacher.credentials,
            orderId: relation.orderId,
          });
        default:
          return Promise.resolve({
            orderId: relation.orderId,
            closedAmount: relation.amount,
            closeTime: Date.now(),
          } satisfies CloseFill);
      }
    }),
  );
}

async function closeLiveOrdersForAmountDecrease(
  request: ExecutionRequest,
  platformClass: "orderClass" | "amountClass",
) {
  if (platformClass === "amountClass" && request.teacher.platform === "binance") {
    const matching = request.existingRelations.filter(
      (relation) =>
        relation.followTraderId === request.trader.id &&
        relation.symbol === request.change.symbol &&
        relation.positionSide === request.change.positionSide,
    );
    let remaining = deriveTracedAmount(request);
    const closeFills: CloseFill[] = [];

    for (const relation of matching) {
      if (!(remaining > 0)) {
        break;
      }

      const closeAmount = Number(Math.min(relation.amount, remaining).toFixed(6));
      if (!(closeAmount > 0)) {
        continue;
      }

      closeFills.push(
        await closeBinanceLiveOrder({
          credentials: request.teacher.credentials,
          orderId: relation.orderId,
          symbol: relation.symbol,
          amount: closeAmount,
          positionSide: relation.positionSide,
        }),
      );
      remaining = Number(Math.max(remaining - closeAmount, 0).toFixed(6));
    }

    return {
      closeFills,
      notes: remaining > 0 ? [`partial amount-class close left ${remaining} amount unmatched`] : [],
    };
  }

  const matching = getOrderClassMatches(request);
  let remaining = deriveTracedAmount(request);
  const closeFills: CloseFill[] = [];
  const notes: string[] = [];

  for (const relation of matching) {
    if (!(remaining > 0)) {
      break;
    }

    const closeAmount = Number(Math.min(relation.amount, remaining).toFixed(6));
    if (!(closeAmount > 0)) {
      continue;
    }

    if (request.teacher.platform === "okx") {
      closeFills.push(
        await closeOkxLiveOrder({
          credentials: request.teacher.credentials,
          orderId: relation.orderId,
          symbol: relation.symbol,
          amount: closeAmount,
          positionSide: relation.positionSide,
        }),
      );
      remaining = Number(Math.max(remaining - closeAmount, 0).toFixed(6));
      continue;
    }

    if (
      (request.teacher.platform === "bitget" || request.teacher.platform === "huobi") &&
      closeAmount === relation.amount
    ) {
      if (request.teacher.platform === "bitget") {
        closeFills.push(
          await closeBitgetLiveOrder({
            credentials: request.teacher.credentials,
            orderId: relation.orderId,
            symbol: relation.symbol,
            amount: relation.amount,
          }),
        );
      } else {
        closeFills.push(
          await closeHuobiLiveOrder({
            credentials: request.teacher.credentials,
            orderId: relation.orderId,
            amount: relation.amount,
          }),
        );
      }
      remaining = Number(Math.max(remaining - closeAmount, 0).toFixed(6));
      continue;
    }

    notes.push(
      `${request.teacher.platform} live partial order-class close is not supported for relation ${relation.orderId}`,
    );
    break;
  }

  if (remaining > 0) {
    notes.push(`partial order-class close left ${remaining} amount unmatched`);
  }

  return {
    closeFills,
    notes,
  };
}

export async function executeTeacherChange(
  request: ExecutionRequest,
): Promise<ExecutionServiceResult | null> {
  const platformClass = getPlatformClass(request.teacher.platform);
  const mode = request.teacher.executionMode ?? "dry-run";

  if (request.change.added || isAmountIncrease(request)) {
    if (
      mode === "live" &&
      (request.teacher.platform === "bitget" ||
        request.teacher.platform === "okx" ||
        request.teacher.platform === "binance" ||
        request.teacher.platform === "huobi")
    ) {
      const tracedAmount = deriveTracedAmount(request);
      if (!(tracedAmount > 0)) {
        return {
          mode,
          platformClass,
          notes: ["live create skipped because traced amount <= 0"],
        } satisfies ExecutionServiceResult;
      }

      const fill = await createLiveOrder(request, tracedAmount);
      if (!fill) {
        return createDryRunFill(request, platformClass);
      }

      return {
        mode,
        platformClass,
        createdFill: fill,
        notes: [`${request.teacher.platform} live create order executed`],
      } satisfies ExecutionServiceResult;
    }

    return createDryRunFill(request, platformClass);
  }

  if (request.change.removed || isAmountDecrease(request)) {
    if (
      mode === "live" &&
      (request.teacher.platform === "bitget" ||
        request.teacher.platform === "okx" ||
        request.teacher.platform === "binance" ||
        request.teacher.platform === "huobi")
    ) {
      const closeResult = isAmountDecrease(request)
        ? await closeLiveOrdersForAmountDecrease(request, platformClass)
        : { closeFills: await closeLiveOrders(request, platformClass), notes: [] };

      return {
        mode,
        platformClass,
        closeFills: closeResult.closeFills,
        notes: [`${request.teacher.platform} live close order executed`, ...closeResult.notes],
      } satisfies ExecutionServiceResult;
    }

    if (isAmountDecrease(request)) {
      return platformClass === "amountClass"
        ? closeForAmountClass(request, mode)
        : closePartialForOrderClass(request, mode);
    }

    return platformClass === "amountClass"
      ? closeForAmountClass(request, mode)
      : closeForOrderClass(request, mode);
  }

  return {
    mode,
    platformClass,
    notes: ["amount-change execution path not implemented yet"],
  } satisfies ExecutionServiceResult;
}
