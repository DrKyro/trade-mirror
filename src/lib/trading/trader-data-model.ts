import type { TraderPlatform } from "#/lib/trading/types";

export type TraderModelStatus = "ready" | "partial" | "missing";

export interface TraderModelField {
  id: string;
  label: string;
  status: TraderModelStatus;
  source: string;
  note?: string;
  pageHint?: string;
}

export interface TraderModelSection {
  id: string;
  label: string;
  note?: string;
  fields: TraderModelField[];
}

export interface TraderPlatformModel {
  platform: TraderPlatform;
  displayName: string;
  sampleTraderId: string;
  sections: TraderModelSection[];
}

const STATUS_WEIGHT: Record<TraderModelStatus, number> = {
  ready: 0,
  partial: 1,
  missing: 2,
};

export function getTraderModelSectionStatus(section: TraderModelSection): TraderModelStatus {
  if (section.fields.length === 0) return "missing";

  let worst: TraderModelStatus = "ready";
  for (const field of section.fields) {
    if (STATUS_WEIGHT[field.status] > STATUS_WEIGHT[worst]) {
      worst = field.status;
    }
  }
  return worst;
}

export function getTraderModelOverallStatus(model: TraderPlatformModel): TraderModelStatus {
  if (model.sections.length === 0) return "missing";

  let worst: TraderModelStatus = "ready";
  for (const section of model.sections) {
    const status = getTraderModelSectionStatus(section);
    if (STATUS_WEIGHT[status] > STATUS_WEIGHT[worst]) {
      worst = status;
    }
  }
  return worst;
}
