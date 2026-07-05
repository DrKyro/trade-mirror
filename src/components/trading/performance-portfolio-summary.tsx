import { MetricCard } from "#/components/trading/metric-card";
import { useI18n } from "#/lib/i18n";
import type { PortfolioSummary } from "#/lib/trading/performance-summary";

export function PerformancePortfolioSummary(props: { summary: PortfolioSummary }) {
  const { t } = useI18n();
  const { summary } = props;

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold">{t("performance.portfolio.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("performance.portfolio.description")}</p>
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
    </div>
  );
}
