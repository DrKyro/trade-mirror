import type { TeacherRecord } from "#/lib/trading/types";

export interface PortfolioSummary {
  copyRelationCount: number;
  activeCopyCount: number;
  realizedProfit: number;
  unrealizedProfit: number;
  accountCount: number;
}

export function buildPortfolioSummary(accounts: TeacherRecord[]): PortfolioSummary {
  let copyRelationCount = 0;
  let activeCopyCount = 0;
  let realizedProfit = 0;
  let unrealizedProfit = 0;

  for (const account of accounts) {
    for (const setting of account.traceTraderList) {
      copyRelationCount += 1;
      if (setting.followStatus === "following") {
        activeCopyCount += 1;
      }
      realizedProfit += setting.followProfit;
      unrealizedProfit += setting.unrealizedProfitSum;
    }
  }

  return {
    copyRelationCount,
    activeCopyCount,
    realizedProfit,
    unrealizedProfit,
    accountCount: accounts.length,
  };
}
