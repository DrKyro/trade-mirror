import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import {
  sortRelationshipRanks,
  type PortfolioRelationshipRank,
  type RelationshipRankSort,
} from "#/lib/trading/performance-analytics";
import { cn } from "#/lib/utils";

export function PerformanceRelationshipRanking(props: {
  ranks: PortfolioRelationshipRank[];
  sortBy: RelationshipRankSort;
  onSortChange: (sortBy: RelationshipRankSort) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { t } = useI18n();
  const sortedRanks = sortRelationshipRanks(props.ranks, props.sortBy);

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t("performance.portfolio.ranking")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("performance.portfolio.rankingHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={props.sortBy === "pnl" ? "default" : "outline"}
            onClick={() => props.onSortChange("pnl")}
          >
            {t("performance.portfolio.sortByPnl")}
          </Button>
          <Button
            size="sm"
            variant={props.sortBy === "drawdown" ? "default" : "outline"}
            onClick={() => props.onSortChange("drawdown")}
          >
            {t("performance.portfolio.sortByDrawdown")}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sortedRanks.length > 0 ? (
          sortedRanks.map((rank, index) => {
            const active = rank.key === props.selectedKey;

            return (
              <button
                key={rank.key}
                type="button"
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition",
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:bg-muted/30",
                )}
                onClick={() => props.onSelect(rank.key)}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{rank.strategyName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {rank.accountName} → {rank.traderName}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                  <div>
                    {t("performance.portfolio.rankWinRate")}: {(rank.winRate * 100).toFixed(1)}%
                  </div>
                  <div>
                    {t("performance.portfolio.rankDrawdown")}: {rank.maxDrawdown.toFixed(2)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "font-semibold tabular-nums",
                      rank.netPnl >= 0 ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {formatSigned(rank.netPnl)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("performance.portfolio.rankTrades", { count: rank.closedTrades })}
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-2xl border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("performance.portfolio.noRanking")}
          </div>
        )}
      </div>
    </section>
  );
}

function formatSigned(value: number) {
  const formatted = value.toFixed(2);
  return value >= 0 ? `+${formatted}` : formatted;
}
