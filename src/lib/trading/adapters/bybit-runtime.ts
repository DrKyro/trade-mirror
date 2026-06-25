import "@tanstack/react-start/server-only";
import type { BybitRuntimeMode, BybitRuntimeStatus } from "#/lib/trading/types";

export interface BybitRuntimeReport {
  status: BybitRuntimeStatus;
  mode: BybitRuntimeMode;
  traderId: string;
  detail: string;
  screenshotPath?: string | null;
}

export class BybitRuntimeError extends Error {
  readonly report: BybitRuntimeReport;

  constructor(report: BybitRuntimeReport) {
    super(report.detail);
    this.name = "BybitRuntimeError";
    this.report = report;
  }
}
