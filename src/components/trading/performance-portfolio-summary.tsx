import {
  BacktestLineChart,
  downsampleChartPoints,
  type BacktestChartPoint,
} from "#/components/trading/backtest-charts";
import { MetricCard } from "#/components/trading/metric-card";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import type { PortfolioSummary } from "#/lib/trading/performance-summary";
import type { HistoryBucket } from "#/lib/trading/strategy-analytics";

export function PerformancePortfolioSummary(props: {
  summary: PortfolioSummary;
  equityCurve: BacktestChartPoint[];
  bucket: HistoryBucket;
  onBucketChange: (bucket: HistoryBucket) => void;
}) {
  const { t } = useI18n();
  const { summary } = props;
  const chartPoints = downsampleChartPoints(props.equityCurve, 240);

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t("performance.portfolio.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("performance.portfolio.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["7d", "30d", "all"] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={props.bucket === item ? "default" : "outline"}
              onClick={() => props.onBucketChange(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label={t("performance.portfolio.realized")}
          value={`${summary.realizedProfit.toFixed(2)} U`}
        />
        <MetricCard
          label={t("performance.portfolio.unrealized")}
          value={`${summary.unrealizedProfit.toFixed(2)} U`}
        />
        <MetricCard
          label={t("performance.portfolio.activeCopies")}
          value={`${summary.activeCopyCount}/${summary.copyRelationCount}`}
        />
        <MetricCard
          label={t("performance.portfolio.accounts")}
          value={String(summary.accountCount)}
        />
        <MetricCard
          label={t("performance.portfolio.net")}
          value={`${(summary.realizedProfit + summary.unrealizedProfit).toFixed(2)} U`}
        />
      </div>

      <div className="mt-6 rounded-2xl border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">{t("performance.portfolio.equityCurve")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("performance.portfolio.equityCurveHint")}
        </p>
        <div className="mt-4">
          <BacktestLineChart
            points={chartPoints}
            color="var(--primary)"
            emptyMessage={t("performance.portfolio.equityEmpty")}
            heightClassName="h-56"
            valueLabel={t("performance.portfolio.equity")}
            valueFormatter={(value) => `${value.toFixed(2)} U`}
            hoverLabelMode="trade"
          />
        </div>
      </div>
    </div>
  );
}
