import { useMemo, useState } from "react";

import {
  BacktestLineChart,
  downsampleChartPoints,
  type BacktestChartPoint,
} from "#/components/trading/backtest-charts";
import { MetricCard } from "#/components/trading/metric-card";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import type { TeacherEquityHistory } from "#/lib/trading/types";

const BUCKETS = ["min", "hour", "day"] as const;

export function AccountEquityChart(props: { history: TeacherEquityHistory }) {
  const { t } = useI18n();
  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]>("hour");
  const points = props.history[bucket];
  const chartPoints = useMemo(() => toChartPoints(points), [points]);

  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t("accounts.overview.equityHistory")}</h3>
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={bucket === item ? "default" : "outline"}
              onClick={() => setBucket(item)}
            >
              {t(`accounts.equityBucket.${item}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <BacktestLineChart
          points={chartPoints}
          color="var(--primary)"
          emptyMessage={t("accounts.overview.noEquityHistory")}
          heightClassName="h-56"
          valueLabel={t("accounts.equity")}
          valueFormatter={(value) => `${value.toFixed(2)} U`}
        />
      </div>

      {points.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MetricCard
            label={t("accounts.equityLatest")}
            value={`${points.at(-1)!.e.toFixed(2)} U`}
          />
          <MetricCard
            label={t("accounts.equityChange")}
            value={`${(points.at(-1)!.e - points[0]!.e).toFixed(2)} U`}
          />
          <MetricCard label={t("accounts.equitySamples")} value={String(points.length)} />
        </div>
      ) : null}
    </div>
  );
}

function toChartPoints(points: TeacherEquityHistory["hour"]) {
  const mapped: BacktestChartPoint[] = points.map((point, index) => ({
    label: String(index + 1),
    value: point.e,
    time: point.t,
  }));

  return downsampleChartPoints(mapped, 240);
}
