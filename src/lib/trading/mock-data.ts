import type {
  AppRuntimeStatus,
  TeacherEquityHistory,
  FollowOrderRelation,
  PositionSnapshot,
  RuntimeEvent,
  TeacherRecord,
  TraderHistoryPosition,
  TraderRecord,
} from "#/lib/trading/types";

function position(
  input: Partial<PositionSnapshot> &
    Pick<PositionSnapshot, "id" | "symbol" | "amount" | "leverage" | "positionSide">,
): PositionSnapshot {
  return {
    entryPrice: 0,
    markPrice: null,
    openTime: null,
    closeTime: null,
    margin: null,
    marginMode: null,
    pnl: null,
    pnlRatio: null,
    closeAvgPrice: null,
    contractValue: null,
    ...input,
  };
}

function followRelation(input: FollowOrderRelation): FollowOrderRelation {
  return input;
}

function historyPosition(input: TraderHistoryPosition): TraderHistoryPosition {
  return input;
}

function teacherEquityHistory(input: Partial<TeacherEquityHistory>): TeacherEquityHistory {
  return {
    min: input.min ?? [],
    hour: input.hour ?? [],
    day: input.day ?? [],
  };
}

export const mockTraders: TraderRecord[] = [
  {
    id: "EAE06055569E8B1A",
    name: "OKX Alpha Rider",
    platform: "okx",
    link: "https://www.okx.com/copy-trading/trader/EAE06055569E8B1A",
    avatar: "https://static.okx.com/cdn/assets/imgs/221/58A0C8A9D582C5D6.png",
    strategyStatus: "follow",
    strategyName: "Alpha Swing",
    strategyRiskRate: 0.18,
    balance: 152340.23,
    monthlyAveragePositionValue: 6840.55,
    threeMonthMaxDrawdown: -438.25,
    positionUpdateTime: Date.now() - 60_000,
    positions: [
      position({
        id: "btc-long-1",
        symbol: "BTCUSDT",
        amount: 0.24,
        leverage: 20,
        positionSide: "long",
        entryPrice: 104_220,
        markPrice: 105_120,
        margin: 1250,
        pnl: 216,
        pnlRatio: 0.17,
        openTime: Date.now() - 3_600_000,
      }),
    ],
    historyPositions: [
      historyPosition({
        id: "okx-history-1",
        symbol: "BTCUSDT",
        side: "long",
        leverage: 20,
        amount: 0.2,
        entryPrice: 103_000,
        closePrice: 104_100,
        openTime: Date.now() - 12 * 60 * 60_000,
        closeTime: Date.now() - 10 * 60 * 60_000,
        profit: 220,
        profitRate: 0.021,
        contractValue: 1,
        source: "okx",
      }),
    ],
  },
  {
    id: "bitget-top-002",
    name: "Bitget Momentum Lab",
    platform: "bitget",
    link: "https://www.bitget.com/copy-trading/trader/bitget-top-002",
    avatar: "https://dummyimage.com/96x96/0f766e/ffffff&text=BG",
    strategyStatus: "watch",
    strategyName: "Momentum Grid",
    strategyRiskRate: 0.12,
    balance: 82_400.11,
    monthlyAveragePositionValue: 5230.9,
    threeMonthMaxDrawdown: -292.11,
    positionUpdateTime: Date.now() - 180_000,
    positions: [
      position({
        id: "eth-short-1",
        symbol: "ETHUSDT",
        amount: 2.1,
        leverage: 12,
        positionSide: "short",
        entryPrice: 2522,
        markPrice: 2498,
        margin: 441,
        pnl: 50.4,
        pnlRatio: 0.11,
        openTime: Date.now() - 5_400_000,
      }),
    ],
    historyPositions: [],
  },
];

const teacherBasePositions = [
  position({
    id: "teacher-btc-1",
    symbol: "BTCUSDT",
    amount: 0.03,
    leverage: 20,
    positionSide: "long",
    entryPrice: 104_250,
    markPrice: 105_100,
    margin: 156,
    pnl: 25.5,
    pnlRatio: 0.16,
    openTime: Date.now() - 3_300_000,
  }),
];

const teacherFollowRelations: FollowOrderRelation[] = [
  followRelation({
    orderId: "follow-btc-1",
    followOrderId: "btc-long-1",
    followTraderId: "EAE06055569E8B1A",
    symbol: "BTCUSDT",
    amount: 0.03,
    positionSide: "long",
    openAvgPrice: 104_250,
    markPrice: 105_100,
    unrealizedProfit: 25.5,
    updateTime: Date.now() - 5_000,
    openTime: Date.now() - 3_300_000,
  }),
];

const now = Date.now();

const sampleEquityHistory = teacherEquityHistory({
  min: Array.from({ length: 12 }, (_, index) => ({
    t: now - (11 - index) * 5 * 60_000,
    e: 12_420 + index * 6.8,
  })),
  hour: Array.from({ length: 12 }, (_, index) => ({
    t: now - (11 - index) * 60 * 60_000,
    e: 12_180 + index * 24.5,
  })),
  day: Array.from({ length: 10 }, (_, index) => ({
    t: now - (9 - index) * 24 * 60 * 60_000,
    e: 11_960 + index * 61.2,
  })),
});

const samplePositionHistory = [
  {
    t: now - 3_300_000,
    orderId: "follow-btc-1",
    symbol: "BTCUSDT",
    side: "long" as const,
    amount: 0.03,
    price: 104_250,
    profit: 0,
    traderId: "EAE06055569E8B1A",
    action: 1 as const,
    ps: "dry-run create execution generated",
    success: 1 as const,
  },
  {
    t: now - 900_000,
    orderId: "follow-btc-1",
    symbol: "BTCUSDT",
    side: "long" as const,
    amount: 0.03,
    price: 105_100,
    profit: 25.5,
    traderId: "EAE06055569E8B1A",
    action: 0 as const,
    ps: "dry-run close execution generated",
    success: 1 as const,
  },
  {
    t: now - 1_200_000,
    orderId: null,
    symbol: "ETHUSDT",
    side: "short" as const,
    amount: 0.2,
    price: 2_520,
    profit: 0,
    traderId: "bitget-top-002",
    action: 1 as const,
    ps: "当前风险率大于最大风险率限制，停止开仓 nowRiskRatio:0.42",
    success: -1 as const,
  },
];

export const mockTeachers: TeacherRecord[] = [
  {
    id: "teacher-001",
    name: "Main Follow Account",
    platform: "bitget",
    credentials: {
      apiKey: "",
      apiSecret: "",
      apiPassword: "",
    },
    executionMode: "dry-run",
    balance: 12_400.23,
    equity: 12_512.94,
    freeUsdt: 9_850.4,
    unrealizedPnl: 42.28,
    maxRiskRatio: 0.16,
    nowRiskRatio: 0.08,
    positions: teacherBasePositions,
    teacherPositions: teacherBasePositions,
    followRelations: teacherFollowRelations,
    traceTraderList: [
      {
        id: "EAE06055569E8B1A",
        name: "OKX Alpha Rider",
        funds: 3000,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.125,
        stopLossUsdt: 200,
        stopLossPositionValueRate: 0.05,
        followStatus: "following",
        unrealizedProfitSum: 25.5,
        followProfit: 322.8,
      },
    ],
    settings: {
      accountMaxRiskRate: 0.2,
      safeMarginRate: 0.25,
      limitRiskRatio: 0.4,
    },
    equityHistory: sampleEquityHistory,
    positionHistory: samplePositionHistory,
  },
];

export const mockRuntimeStatus: AppRuntimeStatus = {
  mongoConnected: false,
  traderSpyConnected: false,
  followEngineRunning: false,
  wsServerUrl: "ws://localhost:8011",
  httpPort: 3001,
  lastHeartbeat: null,
  metadata: {
    refreshScheduler: {
      running: false,
      supportedPlatforms: ["okx", "bitget", "binanceFutures", "bybit"],
      activePlatforms: [],
      iterationCount: 0,
      lastStartedAt: null,
      lastStoppedAt: null,
      lastCompletedAt: null,
      lastError: null,
      pollIntervalMs: 15000,
    },
    marketSubscriptions: {
      derivedFrom: "follow-relations",
      lastReconciledAt: now,
      activePlatforms: ["bitget"],
      totalSymbols: 1,
      totalRelations: 1,
      platforms: [
        {
          platform: "bitget",
          symbols: ["BTCUSDT"],
          symbolCount: 1,
          teacherIds: ["teacher-001"],
          teacherCount: 1,
          relationCount: 1,
          lastMarkUpdateAt: now - 5_000,
          lastTraderSnapshotAt: mockTraders[0]!.positionUpdateTime,
          lastActivityAt: now - 5_000,
        },
      ],
    },
    bybitRuntime: {
      lastStatus: "idle",
      lastMode: null,
      lastTraderId: null,
      lastDetail: null,
      lastScreenshotPath: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
    },
  },
};

export const mockEvents: RuntimeEvent[] = [];

export const traderScenarios: Array<{
  traderId: string;
  positions: PositionSnapshot[];
}> = [
  {
    traderId: "EAE06055569E8B1A",
    positions: [
      position({
        id: "btc-long-1",
        symbol: "BTCUSDT",
        amount: 0.24,
        leverage: 20,
        positionSide: "long",
        entryPrice: 104_220,
        markPrice: 105_120,
        margin: 1250,
        pnl: 216,
        pnlRatio: 0.17,
        openTime: Date.now() - 3_600_000,
      }),
    ],
  },
  {
    traderId: "EAE06055569E8B1A",
    positions: [
      position({
        id: "btc-long-1",
        symbol: "BTCUSDT",
        amount: 0.31,
        leverage: 20,
        positionSide: "long",
        entryPrice: 104_220,
        markPrice: 105_640,
        margin: 1620,
        pnl: 440.2,
        pnlRatio: 0.22,
        openTime: Date.now() - 3_600_000,
      }),
    ],
  },
  {
    traderId: "EAE06055569E8B1A",
    positions: [],
  },
];
