import type { PortfolioSummary } from "#/lib/trading/performance-summary";
import type { RuntimeEvent, TeacherRecord, TraderRecord } from "#/lib/trading/types";

export type DashboardActiveCopy = {
  key: string;
  accountId: string;
  traderId: string;
  accountName: string;
  traderName: string;
  netPnl: number;
};

export type DashboardSummary = {
  portfolio: PortfolioSummary;
  todayPnl: number;
  activeCopies: DashboardActiveCopy[];
  alerts: RuntimeEvent[];
  alertCount: number;
};

const ALERT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_ALERTS = 5;
const MAX_ACTIVE_COPIES = 6;

function startOfTodayMs(now = Date.now()) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function buildTodayCopyPnl(accounts: TeacherRecord[], now = Date.now()) {
  const start = startOfTodayMs(now);
  let total = 0;

  for (const account of accounts) {
    for (const entry of account.positionHistory) {
      if (entry.action === 0 && entry.success === 1 && entry.t >= start) {
        total += entry.profit;
      }
    }
  }

  return total;
}

export function buildActiveCopies(accounts: TeacherRecord[], traders: TraderRecord[]) {
  const traderMap = new Map(traders.map((trader) => [trader.id, trader]));
  const copies: DashboardActiveCopy[] = [];

  for (const account of accounts) {
    for (const setting of account.traceTraderList) {
      if (setting.followStatus !== "following") {
        continue;
      }

      const trader = traderMap.get(setting.id);

      copies.push({
        key: `${account.id}:${setting.id}`,
        accountId: account.id,
        traderId: setting.id,
        accountName: account.name,
        traderName: trader?.name ?? setting.name,
        netPnl: setting.followProfit + setting.unrealizedProfitSum,
      });
    }
  }

  return copies
    .sort((left, right) => Math.abs(right.netPnl) - Math.abs(left.netPnl))
    .slice(0, MAX_ACTIVE_COPIES);
}

export function getDashboardAlerts(events: RuntimeEvent[], now = Date.now()) {
  const since = now - ALERT_LOOKBACK_MS;

  return events.filter((event) => event.level === "warn" && event.timestamp >= since);
}

export function buildDashboardSummary(
  accounts: TeacherRecord[],
  traders: TraderRecord[],
  runtimeEvents: RuntimeEvent[],
  portfolio: PortfolioSummary,
  now = Date.now(),
): DashboardSummary {
  const alerts = getDashboardAlerts(runtimeEvents, now);

  return {
    portfolio,
    todayPnl: buildTodayCopyPnl(accounts, now),
    activeCopies: buildActiveCopies(accounts, traders),
    alerts: alerts.slice(0, MAX_ALERTS),
    alertCount: alerts.length,
  };
}
