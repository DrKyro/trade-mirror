import type { TraderRecord } from "#/lib/trading/types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

const STATUS_LABEL_KEY: Record<TraderRecord["strategyStatus"], string> = {
  follow: "traders.status.follow",
  watch: "traders.status.watch",
  disabled: "traders.status.disabled",
};

export function getTraderStatusLabel(status: TraderRecord["strategyStatus"], t: Translate) {
  return t(STATUS_LABEL_KEY[status]);
}

export function getTraderStatusBadgeVariant(
  status: TraderRecord["strategyStatus"],
): "default" | "secondary" | "outline" {
  if (status === "follow") {
    return "default";
  }
  if (status === "watch") {
    return "secondary";
  }
  return "outline";
}
