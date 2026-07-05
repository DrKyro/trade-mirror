import type { TraceTraderSetting, TraderRecord } from "#/lib/trading/types";

export type CopyTargetFormValues = {
  funds: string;
  traceOrderMode: TraceTraderSetting["traceOrderMode"];
  fixedFunds: string;
  tracePerRatio: string;
  stopLossUsdt: string;
  stopLossPositionValueRate: string;
  followStatus: TraceTraderSetting["followStatus"];
};

export function deriveSuggestedTraceRatio(trader: TraderRecord) {
  if (!trader.threeMonthMaxDrawdown) {
    return 0.1;
  }

  return Number(Math.max(-(100 / trader.threeMonthMaxDrawdown), 0).toFixed(4));
}

export function deriveTraceRatioFromStopLoss(stopLossUsdt: string, trader: TraderRecord) {
  const stopLoss = Number(stopLossUsdt);
  if (!(stopLoss > 0) || !trader.threeMonthMaxDrawdown) {
    return "0";
  }

  return Math.max(-(stopLoss / trader.threeMonthMaxDrawdown), 0).toFixed(4);
}

export function buildDefaultCopyTargetFormValues(
  existing?: TraceTraderSetting | null,
  trader?: TraderRecord,
): CopyTargetFormValues {
  return {
    funds: String(existing?.funds ?? 0),
    traceOrderMode: existing?.traceOrderMode ?? "ratio",
    fixedFunds: String(existing?.fixedFunds ?? 0),
    tracePerRatio: String(
      existing?.tracePerRatio ?? (trader ? deriveSuggestedTraceRatio(trader) : 0.1),
    ),
    stopLossUsdt: String(existing?.stopLossUsdt ?? 0),
    stopLossPositionValueRate: String(existing?.stopLossPositionValueRate ?? 0.05),
    followStatus: existing?.followStatus ?? "following",
  };
}

export function formValuesToTraceSetting(
  base: Pick<TraceTraderSetting, "id" | "name" | "unrealizedProfitSum" | "followProfit">,
  values: CopyTargetFormValues,
): TraceTraderSetting {
  return {
    ...base,
    funds: Number(values.funds),
    traceOrderMode: values.traceOrderMode,
    fixedFunds: Number(values.fixedFunds),
    tracePerRatio: Number(values.tracePerRatio),
    stopLossUsdt: Number(values.stopLossUsdt),
    stopLossPositionValueRate: Number(values.stopLossPositionValueRate),
    followStatus: values.followStatus,
  };
}
