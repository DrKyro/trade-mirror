import type { TeacherRecord, TraderRecord } from "#/lib/trading/types";

export function getAccountsLinkedToTrader(accounts: TeacherRecord[], traderId: string) {
  return accounts.filter((account) => account.traceTraderList.some((item) => item.id === traderId));
}

export function getTraderUnrealizedPnl(trader: TraderRecord) {
  return trader.positions.reduce((sum, position) => sum + (position.pnl ?? 0), 0);
}

export function formatTraderLastUpdate(trader: TraderRecord) {
  if (!trader.positionUpdateTime) {
    return null;
  }
  return new Date(trader.positionUpdateTime).toLocaleString();
}
