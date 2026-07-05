import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "#/components/ui/card";
import { useI18n } from "#/lib/i18n";
import { getPlatformLabel } from "#/lib/trading/platform-utils";
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

export function TraderCard(props: { trader: TraderRecord; accounts: TeacherRecord[] }) {
  const { t } = useI18n();
  const { trader, accounts } = props;
  const linkedAccounts = getAccountsLinkedToTrader(accounts, trader.id);
  const unrealizedPnl = getTraderUnrealizedPnl(trader);
  const lastUpdate = formatTraderLastUpdate(trader);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{trader.name}</CardTitle>
          <Badge variant="outline">{getPlatformLabel(trader.platform)}</Badge>
          <Badge variant={getTraderStatusBadgeVariant(trader.strategyStatus)}>
            {getTraderStatusLabel(trader.strategyStatus, t)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {trader.strategyName} · {trader.positions.length} {t("traders.card.positions")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold tracking-tight">
          {trader.balance.toFixed(2)}{" "}
          <span className="text-sm font-normal text-muted-foreground">U</span>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className={unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
            {t("traders.card.unrealized", { value: unrealizedPnl.toFixed(2) })}
          </span>
          <span>
            {lastUpdate
              ? t("traders.card.updated", { time: lastUpdate })
              : t("traders.card.neverUpdated")}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {linkedAccounts.length > 0
            ? t("traders.card.linkedAccounts", {
                names: linkedAccounts.map((account) => account.name).join(", "),
              })
            : t("traders.card.noLinkedAccount")}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/traders/$traderId" params={{ traderId: trader.id }} />}
          nativeButton={false}
        >
          {t("traders.card.viewDetail")}
        </Button>
        {accounts.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            render={
              <Link
                to="/app/accounts/$accountId"
                params={{ accountId: (linkedAccounts[0] ?? accounts[0])!.id }}
                search={{
                  tab: "follow",
                  ...(linkedAccounts.length > 0 ? {} : { addTrader: trader.id }),
                }}
              />
            }
            nativeButton={false}
          >
            {t("traders.card.configureCopy")}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
