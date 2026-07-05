import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { CopyTargetAccountLink } from "#/components/trading/copy-target-account-link";
import { MetricCard } from "#/components/trading/metric-card";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import { getPlatformLabel } from "#/lib/trading/platform-utils";
import { $updateTrader } from "#/lib/trading/repository";
import {
  getTraderStatusBadgeVariant,
  getTraderStatusLabel,
} from "#/lib/trading/trader-status-labels";
import {
  formatTraderLastUpdate,
  getAccountsLinkedToTrader,
  getTraderUnrealizedPnl,
} from "#/lib/trading/trader-workspace-utils";
import type { TeacherRecord, TraderRecord } from "#/lib/trading/types";

export function TraderDetailHeader(props: { trader: TraderRecord; accounts: TeacherRecord[] }) {
  const { t } = useI18n();
  const linkedAccounts = getAccountsLinkedToTrader(props.accounts, props.trader.id);
  const unrealizedPnl = getTraderUnrealizedPnl(props.trader);
  const lastUpdate = formatTraderLastUpdate(props.trader);

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">{props.trader.name}</h2>
            <Badge variant="outline">{getPlatformLabel(props.trader.platform)}</Badge>
            <Badge variant={getTraderStatusBadgeVariant(props.trader.strategyStatus)}>
              {getTraderStatusLabel(props.trader.strategyStatus, t)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{props.trader.strategyName}</p>
          <a
            className="text-sm text-primary underline-offset-4 hover:underline"
            href={props.trader.link}
            target="_blank"
            rel="noreferrer"
          >
            {t("traders.detail.openExchangePage")}
          </a>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-3">
          <MetricCard
            label={t("traders.detail.balance")}
            value={`${props.trader.balance.toFixed(2)} U`}
          />
          <MetricCard
            label={t("traders.detail.positions")}
            value={String(props.trader.positions.length)}
          />
          <MetricCard
            label={t("traders.detail.unrealized")}
            value={`${unrealizedPnl.toFixed(2)} U`}
          />
          <MetricCard
            label={t("traders.detail.linkedAccounts")}
            value={String(linkedAccounts.length)}
          />
        </div>
      </div>
      {lastUpdate ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("traders.card.updated", { time: lastUpdate })}
        </p>
      ) : null}
    </div>
  );
}

export function TraderOverviewPanel(props: { trader: TraderRecord; accounts: TeacherRecord[] }) {
  const { t } = useI18n();
  const linkedAccounts = getAccountsLinkedToTrader(props.accounts, props.trader.id);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("traders.detail.monthlyAvgPosition")}
          value={props.trader.monthlyAveragePositionValue.toFixed(2)}
        />
        <MetricCard
          label={t("traders.detail.maxDrawdown")}
          value={props.trader.threeMonthMaxDrawdown.toFixed(2)}
        />
        <MetricCard
          label={t("traders.detail.riskRate")}
          value={props.trader.strategyRiskRate.toFixed(2)}
        />
        <MetricCard
          label={t("traders.detail.historyPositions")}
          value={String(props.trader.historyPositions?.length ?? 0)}
        />
      </div>

      <div className="rounded-2xl border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">{t("traders.detail.copyAccounts")}</h3>
        {linkedAccounts.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {linkedAccounts.map((account) => (
              <li key={account.id}>
                <Link
                  to="/app/accounts/$accountId"
                  params={{ accountId: account.id }}
                  search={{ tab: "follow" }}
                  className="text-primary hover:underline"
                >
                  {account.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("traders.card.noLinkedAccount")}</p>
        )}
        <div className="mt-4">
          <CopyTargetAccountLink trader={props.trader} accounts={props.accounts} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              to="/app/backtest/$platform/$traderId"
              params={{ platform: props.trader.platform, traderId: props.trader.id }}
            />
          }
          nativeButton={false}
        >
          {t("traders.detail.openBacktest")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              to="/app/performance"
              search={{
                copy: linkedAccounts[0] ? `${linkedAccounts[0].id}:${props.trader.id}` : undefined,
              }}
            />
          }
          nativeButton={false}
          disabled={linkedAccounts.length === 0}
        >
          {t("traders.detail.viewPerformance")}
        </Button>
      </div>
    </div>
  );
}

export function TraderPositionsPanel(props: { trader: TraderRecord }) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{t("traders.positions.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("traders.positions.description")}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("traders.positions.count", { count: props.trader.positions.length })}
        </div>
      </div>
      {props.trader.positions.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-background">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">{t("accounts.table.symbol")}</th>
                <th className="px-3 py-2">{t("accounts.table.side")}</th>
                <th className="px-3 py-2">{t("accounts.table.amount")}</th>
                <th className="px-3 py-2">{t("accounts.table.entry")}</th>
                <th className="px-3 py-2">{t("accounts.table.pnl")}</th>
                <th className="px-3 py-2">{t("accounts.table.time")}</th>
              </tr>
            </thead>
            <tbody>
              {props.trader.positions.map((position) => (
                <tr key={position.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{position.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">
                      {position.positionSide === "long"
                        ? t("accounts.side.long")
                        : t("accounts.side.short")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{position.amount.toFixed(3)}</td>
                  <td className="px-3 py-2">{position.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={(position.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}
                    >
                      {(position.pnl ?? 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {position.openTime ? new Date(position.openTime).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          {t("traders.positions.empty")}
        </div>
      )}
    </div>
  );
}

export function TraderSettingsPanel(props: {
  trader: TraderRecord;
  onSubmitted?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    strategyName: props.trader.strategyName,
    strategyStatus: props.trader.strategyStatus,
    strategyRiskRate: String(props.trader.strategyRiskRate),
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="rounded-2xl border bg-muted/20 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await $updateTrader({
            data: {
              id: props.trader.id,
              strategyName: form.strategyName,
              strategyStatus: form.strategyStatus,
              strategyRiskRate: Number(form.strategyRiskRate),
            },
          });
          await props.onSubmitted?.();
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">{t("traders.settings.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("traders.settings.description")}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`trader-name-${props.trader.id}`}>
            {t("traders.settings.displayName")}
          </Label>
          <Input
            id={`trader-name-${props.trader.id}`}
            value={form.strategyName}
            onChange={(event) =>
              setForm((current) => ({ ...current, strategyName: event.target.value }))
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`trader-status-${props.trader.id}`}>{t("traders.settings.status")}</Label>
          <select
            id={`trader-status-${props.trader.id}`}
            className="h-9 rounded-2xl border bg-background px-3 text-sm"
            value={form.strategyStatus}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                strategyStatus: event.target.value as TraderRecord["strategyStatus"],
              }))
            }
          >
            <option value="follow">{t("traders.status.follow")}</option>
            <option value="watch">{t("traders.status.watch")}</option>
            <option value="disabled">{t("traders.status.disabled")}</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`trader-risk-${props.trader.id}`}>{t("traders.settings.riskRate")}</Label>
          <Input
            id={`trader-risk-${props.trader.id}`}
            value={form.strategyRiskRate}
            onChange={(event) =>
              setForm((current) => ({ ...current, strategyRiskRate: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? t("common.saving") : t("traders.settings.save")}
        </Button>
      </div>
    </form>
  );
}
