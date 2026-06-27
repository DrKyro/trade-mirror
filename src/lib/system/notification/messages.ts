import type { PositionChange, PositionSnapshot, TraderRecord } from "#/lib/trading/types";

function positionSideLabel(value: PositionSnapshot["positionSide"]) {
  return value === "long" ? "多" : "空";
}

function formatNumber(value: number | null | undefined, digits = 6) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return Number(value.toFixed(digits)).toString();
}

function formatPositionLines(positions: PositionSnapshot[]) {
  if (positions.length === 0) {
    return ["当前持仓：无"];
  }

  const lines = ["当前持仓："];
  for (const position of positions) {
    lines.push(
      [
        `${position.symbol}`,
        `${positionSideLabel(position.positionSide)}`,
        `数量:${formatNumber(position.amount)}`,
        `开仓:${formatNumber(position.entryPrice)}`,
        `现价:${formatNumber(position.markPrice)}`,
        `杠杆:${formatNumber(position.leverage, 2)}`,
      ].join(" "),
    );
  }

  return lines;
}

function formatChangeLines(changes: PositionChange[]) {
  const lines = ["仓位变化："];
  for (const change of changes) {
    lines.push(change.message);
  }
  return lines;
}

export function buildTraderChangeMessage(
  trader: Pick<TraderRecord, "name" | "platform" | "link">,
  changes: PositionChange[],
  positions: PositionSnapshot[],
) {
  return [
    "交易员仓位变更",
    `交易员：${trader.name}`,
    ...formatChangeLines(changes),
    "---------------------",
    `平台：${trader.platform}`,
    `链接：${trader.link}`,
    "---------------------",
    ...formatPositionLines(positions),
  ].join("\n");
}

export function buildRuntimeWarningMessage(
  scope: string | undefined,
  title: string,
  detail: string,
) {
  return ["运行告警", scope ? `范围：${scope}` : null, `标题：${title}`, `详情：${detail}`]
    .filter(Boolean)
    .join("\n");
}

export function buildStartupMessage(detail: string) {
  return ["系统启动", "标题：Merged trader runtime started", `详情：${detail}`].join("\n");
}
