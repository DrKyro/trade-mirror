export type TraderPlatform = "okx" | "bitget" | "bybit" | "binanceFutures";

export type TraderBacktestMode = "fixed" | "compound";

export type TraderBacktestWindow = "30d" | "90d" | "all";

export type StrategyStatus = "follow" | "watch" | "disabled";

export type TraceOrderMode = "fixed" | "ratio";

export type PositionSide = "long" | "short";

export interface EquityHistoryPoint {
  t: number;
  e: number;
}

export interface TeacherEquityHistory {
  min: EquityHistoryPoint[];
  hour: EquityHistoryPoint[];
  day: EquityHistoryPoint[];
}

export interface TeacherPositionHistoryEntry {
  t: number;
  orderId: string | null;
  symbol: string;
  side: PositionSide;
  amount: number;
  price: number;
  profit: number;
  traderId: string;
  action: 0 | 1;
  ps: string;
  success?: -1 | 0 | 1;
}

export interface PositionSnapshot {
  id: string;
  symbol: string;
  entryPrice: number;
  markPrice: number | null;
  amount: number;
  leverage: number;
  openTime: number | null;
  closeTime: number | null;
  margin: number | null;
  marginMode: string | null;
  pnl: number | null;
  pnlRatio: number | null;
  positionSide: PositionSide;
  closeAvgPrice: number | null;
  contractValue: number | null;
}

export interface TraderHistoryPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  leverage: number;
  amount: number;
  entryPrice: number;
  closePrice: number;
  openTime: number | null;
  closeTime: number | null;
  profit: number | null;
  profitRate: number | null;
  contractValue: number | null;
  source: TraderPlatform;
}

export interface MarketCandle {
  platform: TraderPlatform;
  symbol: string;
  interval: "1m" | "5m";
  datetime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PositionChange extends PositionSnapshot {
  added?: boolean;
  removed?: boolean;
  amountChange?: number;
  message: string;
}

export interface TraderRecord {
  id: string;
  name: string;
  nickName?: string;
  platform: TraderPlatform;
  link: string;
  avatar: string;
  sign?: string;
  strategyStatus: StrategyStatus;
  strategyName: string;
  strategyRiskRate: number;
  balance: number;
  monthlyAveragePositionValue: number;
  threeMonthMaxDrawdown: number;
  positionUpdateTime: number | null;
  positions: PositionSnapshot[];
  historyPositions?: TraderHistoryPosition[];
  syncState?: TraderSyncState | null;
}

export interface TraderBacktestTrade {
  id: string;
  symbol: string;
  side: PositionSide;
  openTime: number;
  closeTime: number;
  amount: number;
  entryPrice: number;
  closePrice: number;
  leverage: number;
  sourceProfit: number;
  sourceProfitRate: number;
  simulatedProfit: number;
  cumulativeProfit: number;
  equityAfter: number;
  drawdown: number;
  drawdownRate: number;
}

export interface TraderBacktestTimelinePoint {
  time: number;
  tradeId: string;
  symbol: string;
  cumulativeProfit: number;
  equity: number;
  drawdown: number;
  drawdownRate: number;
}

export interface TraderBacktestSummary {
  closedTrades: number;
  winRate: number;
  realizedProfit: number;
  totalReturn: number;
  finalEquity: number;
  maxDrawdown: number;
  maxDrawdownRate: number;
  averageTradeReturn: number;
  largestGain: number;
  largestLoss: number;
  grossProfit: number;
  grossLoss: number;
  profitFactorLabel: string;
}

export interface TraderBacktestRunRecord {
  id: string;
  userId: string;
  platform: TraderPlatform;
  traderId: string;
  uniqueName: string;
  nickName: string;
  mode: TraderBacktestMode;
  window: TraderBacktestWindow;
  initialBalance: number;
  summary: TraderBacktestSummary;
  timeline: TraderBacktestTimelinePoint[];
  trades: TraderBacktestTrade[];
  createdAt: number;
  updatedAt: number;
}

export interface TraceTraderSetting {
  id: string;
  name: string;
  funds: number;
  traceOrderMode: TraceOrderMode;
  fixedFunds: number;
  tracePerRatio: number;
  stopLossUsdt: number;
  stopLossPositionValueRate: number;
  followStatus: "following" | "unfollow";
  unrealizedProfitSum: number;
  followProfit: number;
}

export interface FollowOrderRelation {
  orderId: string;
  followOrderId: string;
  followTraderId: string;
  symbol: string;
  amount: number;
  positionSide: PositionSide;
  openAvgPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  updateTime: number | null;
  openTime: number | null;
}

export interface TeacherSettings {
  accountMaxRiskRate: number;
  safeMarginRate: number;
  limitRiskRatio: number;
}

export interface TeacherCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassword?: string | null;
}

export type ExecutionMode = "dry-run" | "live";

export type RefreshSchedulerPlatform = "okx" | "bitget" | "binanceFutures" | "bybit";

export type TraderSyncPriority = "live" | "active" | "watch" | "cold";

export type TraderSyncStatus = "idle" | "running" | "success" | "failed";

export interface TraderSyncState {
  traderId: string;
  priority: TraderSyncPriority;
  enabled: boolean;
  fetchIntervalMs: number;
  nextFetchAt: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastStatus: TraderSyncStatus;
  lastError: string | null;
  failCount: number;
  lockedUntil: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RefreshSchedulerState {
  running: boolean;
  supportedPlatforms: readonly RefreshSchedulerPlatform[];
  activePlatforms: RefreshSchedulerPlatform[];
  iterationCount: number;
  lastStartedAt: number | null;
  lastStoppedAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
  pollIntervalMs: number;
}

export interface MarketSubscriptionPlatformState {
  platform: TraderPlatform;
  symbols: string[];
  symbolCount: number;
  teacherIds: string[];
  teacherCount: number;
  relationCount: number;
  lastMarkUpdateAt: number | null;
  lastTraderSnapshotAt: number | null;
  lastActivityAt: number | null;
}

export interface MarketSubscriptionState {
  derivedFrom: "follow-relations";
  lastReconciledAt: number | null;
  activePlatforms: TraderPlatform[];
  totalSymbols: number;
  totalRelations: number;
  platforms: MarketSubscriptionPlatformState[];
}

export interface NotificationConfigState {
  enabledProviders: Array<"feishu" | "telegram" | "discord">;
  feishuEnabled: boolean;
  telegramEnabled: boolean;
  discordEnabled: boolean;
  routeSummary: Record<string, Array<"feishu" | "telegram" | "discord">>;
  runtimeRouteOverrides?: Partial<Record<string, Array<"feishu" | "telegram" | "discord">>> | null;
  traderChangeAlertsEnabled: boolean;
  warningAlertsEnabled: boolean;
  startupAlertsEnabled: boolean;
}

export type BybitRuntimeMode = "api" | "browser-fallback";

export type BybitRuntimeStatus =
  | "idle"
  | "api-success"
  | "browser-success"
  | "login-required"
  | "access-denied"
  | "browser-launch-failed"
  | "payload-error";

export interface BybitRuntimeState {
  lastStatus: BybitRuntimeStatus;
  lastMode: BybitRuntimeMode | null;
  lastTraderId: string | null;
  lastDetail: string | null;
  lastScreenshotPath: string | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
}

export interface TradingRuntimeMetadata {
  refreshScheduler?: RefreshSchedulerState;
  marketSubscriptions?: MarketSubscriptionState;
  bybitRuntime?: BybitRuntimeState;
  notificationRouteOverrides?: Partial<Record<string, Array<"feishu" | "telegram" | "discord">>>;
}

export interface TeacherRecord {
  id: string;
  name: string;
  platform: TraderPlatform;
  credentials?: TeacherCredentials | null;
  executionMode?: ExecutionMode;
  balance: number;
  equity: number;
  freeUsdt: number;
  unrealizedPnl: number;
  maxRiskRatio: number;
  nowRiskRatio: number;
  positions: PositionSnapshot[];
  teacherPositions: PositionSnapshot[];
  followRelations: FollowOrderRelation[];
  traceTraderList: TraceTraderSetting[];
  settings: TeacherSettings;
  equityHistory: TeacherEquityHistory;
  positionHistory: TeacherPositionHistoryEntry[];
  lastSignalAt?: number | null;
}

export interface AppRuntimeStatus {
  mongoConnected: boolean;
  traderSpyConnected: boolean;
  followEngineRunning: boolean;
  wsServerUrl: string;
  httpPort: number;
  lastHeartbeat: number | null;
  metadata?: TradingRuntimeMetadata | null;
}

export interface RuntimeEvent {
  id: string;
  scope: "trader-spy" | "follow-engine" | "system";
  level: "info" | "warn";
  title: string;
  detail: string;
  timestamp: number;
  entityType?: "teacher" | "trader" | "system";
  entityId?: string;
}

export interface ExecutionRequest {
  teacher: TeacherRecord;
  trader: TraderRecord;
  change: PositionChange;
  traceSetting: TraceTraderSetting;
  existingRelations: FollowOrderRelation[];
}

export interface ExecutionFill {
  orderId: string;
  followOrderId: string;
  symbol: string;
  amount: number;
  positionSide: PositionSide;
  openAvgPrice: number;
  openTime: number | null;
}

export interface CloseFill {
  orderId: string;
  closedAmount: number;
  closeTime: number | null;
}

export interface ExecutionServiceResult {
  mode: ExecutionMode;
  platformClass: "orderClass" | "amountClass";
  createdFill?: ExecutionFill | null;
  closeFills?: CloseFill[];
  notes?: string[];
}
