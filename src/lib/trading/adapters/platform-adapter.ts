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
  TeacherCredentials,
  TraderBacktestWindow,
  TraderPlatform,
  TraderRecord,
} from "#/lib/trading/types";

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
  createLiveOrder?(input: {
    credentials: TeacherCredentials | null | undefined;
    symbol: string;
    amount: number;
    positionSide: "long" | "short";
    followOrderId: string;
  }): Promise<ExecutionFill>;
  closeLiveOrder?(input: {
    credentials: TeacherCredentials | null | undefined;
    symbol: string;
    amount: number;
    positionSide: "long" | "short";
    orderId: string;
  }): Promise<CloseFill>;
  fetchTeacherAccount?(
    credentials: TeacherCredentials | null | undefined,
  ): Promise<TeacherAccountSnapshot>;
  buildTraderLink(traderId: string): string;
}
