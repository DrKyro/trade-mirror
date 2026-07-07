import "@tanstack/react-start/server-only";
import type { TraderPlatformModel } from "#/lib/trading/trader-data-model";
import type { TraderProfileInference } from "#/lib/trading/trader-profile-inference";
import type {
  TraderRankQuery,
  TraderRankResult,
  TraderDeepAnalysis,
} from "#/lib/trading/trader-rank-types";
import type {
  CloseFill,
  ExecutionFill,
  PositionSnapshot,
  ExecutionMode,
  TeacherCredentials,
  TraderBacktestWindow,
  TraderPlatform,
  TraderRecord,
} from "#/lib/trading/types";

export interface TeacherExchangeContext {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
}

export interface TraderLiveSnapshot {
  positions: PositionSnapshot[];
  traderPatch?: Partial<TraderRecord>;
}

export interface TeacherAccountSnapshot {
  balance: number;
  equity: number;
  freeUsdt: number;
  unrealizedPnl: number;
  teacherPositions: PositionSnapshot[];
}

export interface EndpointDefinition {
  id: string;
  name: string;
  method: "GET" | "POST";
  buildUrl: (params: Record<string, string | number>) => string;
  extraHeaders?: Record<string, string>;
  buildBody?: (params: Record<string, string | number>) => unknown;
  extractCount: (data: unknown) => number | null;
  requiresAuth?: boolean;
  integrated: boolean;
}

export interface FetchTraderDeepAnalysisOptions {
  historyWindow?: TraderBacktestWindow;
}

export interface PlatformAdapter {
  readonly platform: TraderPlatform;
  readonly displayName: string;
  readonly traderModel: TraderPlatformModel;
  readonly headers: Record<string, string>;
  isSuccessCode(payload: unknown): boolean;
  readonly endpoints: EndpointDefinition[];
  fetchLiveSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot>;
  fetchRankList?(query: TraderRankQuery): Promise<TraderRankResult>;
  inferProfile?(traderId: string): Promise<TraderProfileInference | null>;
  fetchDeepAnalysis?(
    traderId: string,
    options?: FetchTraderDeepAnalysisOptions,
  ): Promise<TraderDeepAnalysis>;
  createLiveOrder?(
    input: TeacherExchangeContext & {
      symbol: string;
      amount: number;
      positionSide: "long" | "short";
      followOrderId: string;
      leverage?: number;
      marginMode?: string | null;
    },
  ): Promise<ExecutionFill>;
  closeLiveOrder?(
    input: TeacherExchangeContext & {
      symbol: string;
      amount: number;
      positionSide: "long" | "short";
      orderId: string;
      leverage?: number;
      marginMode?: string | null;
    },
  ): Promise<CloseFill>;
  fetchTeacherAccount?(input: TeacherExchangeContext): Promise<TeacherAccountSnapshot>;
  buildTraderLink(traderId: string): string;
}
