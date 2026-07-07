import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangleIcon, ArrowRightIcon } from "lucide-react";

import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import { buildDashboardSummary } from "#/lib/trading/dashboard-summary";
import { buildPortfolioSummary } from "#/lib/trading/performance-summary";
import {
  accountsQueryOptions,
  runtimeEventsQueryOptions,
  tradersQueryOptions,
} from "#/lib/trading/queries";
import type { RuntimeEvent } from "#/lib/trading/types";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_auth/app/")({
  loader: async ({ context }) => {
    const [accounts, traders, runtimeEvents] = await Promise.all([
      context.queryClient.ensureQueryData(accountsQueryOptions()),
      context.queryClient.ensureQueryData(tradersQueryOptions()),
      context.queryClient.ensureQueryData(runtimeEventsQueryOptions()),
    ]);

    const portfolio = buildPortfolioSummary(accounts);

    return {
      traderCount: traders.length,
      dashboard: buildDashboardSummary(accounts, traders, runtimeEvents, portfolio),
    };
  },
  component: AppDashboardPage,
});

function AppDashboardPage() {
  const { t } = useI18n();
  const { dashboard, traderCount } = Route.useLoaderData();
  const netPnl = dashboard.portfolio.realizedProfit + dashboard.portfolio.unrealizedProfit;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="text-sm font-medium text-primary">{t("dashboard.badge")}</div>
            <h1 className="text-4xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("dashboard.description")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label={t("dashboard.stats.traders")} value={String(traderCount)} />
            <StatCard
              label={t("dashboard.stats.accounts")}
              value={String(dashboard.portfolio.accountCount)}
            />
            <StatCard
              label={t("dashboard.stats.activeCopies")}
              value={`${dashboard.portfolio.activeCopyCount}/${dashboard.portfolio.copyRelationCount}`}
            />
            <StatCard
              label={t("dashboard.stats.todayPnl")}
              value={formatSigned(dashboard.todayPnl)}
              tone={dashboard.todayPnl >= 0 ? "positive" : "negative"}
            />
            <StatCard
              label={t("dashboard.stats.netPnl")}
              value={formatSigned(netPnl)}
              tone={netPnl >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">{t("dashboard.quickActions")}</h2>
            <div className="flex flex-wrap gap-3">
              <Button render={<Link to="/app/discover" />} nativeButton={false}>
                {t("nav.discover")}
              </Button>
              <Button variant="outline" render={<Link to="/app/traders" />} nativeButton={false}>
                {t("dashboard.openTraders")}
              </Button>
              <Button variant="outline" render={<Link to="/app/accounts" />} nativeButton={false}>
                {t("dashboard.openAccounts")}
              </Button>
              <Button
                variant="outline"
                render={<Link to="/app/performance" />}
                nativeButton={false}
              >
                {t("dashboard.openPerformance")}
              </Button>
              <Button variant="outline" render={<Link to="/app/system" />} nativeButton={false}>
                {t("dashboard.openSystem")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("dashboard.activeCopies.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.activeCopies.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              render={<Link to="/app/performance" />}
              nativeButton={false}
            >
              {t("dashboard.activeCopies.viewAll")}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {dashboard.activeCopies.length > 0 ? (
              dashboard.activeCopies.map((copy) => (
                <Link
                  key={copy.key}
                  to="/app/performance"
                  search={{ copy: copy.key }}
                  className="flex items-center justify-between gap-4 rounded-2xl border bg-background px-4 py-3 transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{copy.traderName}</div>
                    <div className="truncate text-xs text-muted-foreground">{copy.accountName}</div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      copy.netPnl >= 0 ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {formatSigned(copy.netPnl)}
                  </div>
                </Link>
              ))
            ) : (
              <EmptyPanel message={t("dashboard.activeCopies.empty")} />
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("dashboard.alerts.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.alerts.description", { count: dashboard.alertCount })}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              render={<Link to="/app/system" />}
              nativeButton={false}
            >
              {t("dashboard.alerts.viewAll")}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {dashboard.alerts.length > 0 ? (
              dashboard.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
            ) : (
              <EmptyPanel message={t("dashboard.alerts.empty")} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AlertRow(props: { alert: RuntimeEvent }) {
  return (
    <Link
      to="/app/system"
      className="block rounded-2xl border border-amber-200/70 bg-amber-50/50 px-4 py-3 transition hover:border-amber-300 dark:border-amber-900/50 dark:bg-amber-950/20"
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{props.alert.title}</div>
          {props.alert.detail ? (
            <div className="mt-1 text-sm text-muted-foreground">{props.alert.detail}</div>
          ) : null}
          <div className="mt-2 text-xs text-muted-foreground">
            {new Date(props.alert.timestamp).toLocaleString()}
          </div>
        </div>
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}

function EmptyPanel(props: { message: string }) {
  return (
    <div className="rounded-2xl border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {props.message}
    </div>
  );
}

function StatCard(props: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold",
          props.tone === "positive" && "text-emerald-600",
          props.tone === "negative" && "text-rose-600",
        )}
      >
        {props.value}
      </div>
    </div>
  );
}

function formatSigned(value: number) {
  const formatted = value.toFixed(2);
  return value >= 0 ? `+${formatted}` : formatted;
}
