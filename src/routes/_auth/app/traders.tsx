import { createFileRoute, Link } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TradingPageShell } from "#/components/trading/page-shell";
import { TraderCard } from "#/components/trading/trader-card";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useI18n } from "#/lib/i18n";
import { accountsQueryOptions, tradersQueryOptions } from "#/lib/trading/queries";
import type { TraderRecord } from "#/lib/trading/types";

type StatusFilter = "all" | TraderRecord["strategyStatus"];

export const Route = createFileRoute("/_auth/app/traders")({
  loader: async ({ context }) => {
    const [traders, accounts] = await Promise.all([
      context.queryClient.ensureQueryData(tradersQueryOptions()),
      context.queryClient.ensureQueryData(accountsQueryOptions()),
    ]);
    return { traders, accounts };
  },
  component: TradersPage,
});

function TradersPage() {
  const { traders, accounts } = Route.useLoaderData();
  const router = useRouter();
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const filteredTraders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return traders.filter((trader) => {
      if (statusFilter !== "all" && trader.strategyStatus !== statusFilter) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        trader.name.toLowerCase().includes(normalized) ||
        trader.strategyName.toLowerCase().includes(normalized) ||
        trader.id.toLowerCase().includes(normalized)
      );
    });
  }, [query, statusFilter, traders]);

  const summary = useMemo(() => buildSummary(traders), [traders]);

  return (
    <TradingPageShell
      title={t("traders.pageTitle")}
      description={t("traders.pageDescription")}
      actions={
        <Button size="sm" render={<Link to="/app/discover" />} nativeButton={false}>
          {t("traders.addFromDiscover")}
        </Button>
      }
    >
      <TraderOnboardingGuide />

      {traders.length > 0 ? (
        <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t("traders.summary", summary)}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "follow", "watch", "disabled"] as const).map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={statusFilter === filter ? "default" : "outline"}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "all" ? t("traders.filter.all") : t(`traders.status.${filter}`)}
            </Button>
          ))}
        </div>
        <Input
          className="max-w-xs"
          placeholder={t("traders.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filteredTraders.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTraders.map((trader) => (
            <TraderCard key={trader.id} trader={trader} accounts={accounts} />
          ))}
        </div>
      ) : traders.length > 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {t("traders.noFilterResults")}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
          <h2 className="text-lg font-semibold">{t("traders.emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("traders.emptyDescription")}
          </p>
          <Button
            className="mt-6"
            render={<Link to="/app/discover" />}
            nativeButton={false}
            onClick={() => void router.invalidate()}
          >
            {t("traders.addFromDiscover")}
          </Button>
        </div>
      )}
    </TradingPageShell>
  );
}

function TraderOnboardingGuide() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">{t("traders.onboarding.title")}</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>{t("traders.onboarding.step1")}</li>
        <li>{t("traders.onboarding.step2")}</li>
        <li>{t("traders.onboarding.step3")}</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/discover" />}
          nativeButton={false}
        >
          {t("accounts.overview.openDiscover")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/accounts" />}
          nativeButton={false}
        >
          {t("dashboard.openAccounts")}
        </Button>
      </div>
    </div>
  );
}

function buildSummary(traders: TraderRecord[]) {
  const activeSignals = traders.filter((trader) => trader.strategyStatus === "follow").length;
  const openPositions = traders.reduce((sum, trader) => sum + trader.positions.length, 0);

  return {
    count: traders.length,
    activeSignals,
    openPositions,
  };
}
