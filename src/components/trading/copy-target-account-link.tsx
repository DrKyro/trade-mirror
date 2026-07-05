import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import type { TeacherRecord, TraderRecord } from "#/lib/trading/types";

export function CopyTargetAccountLink(props: { trader: TraderRecord; accounts: TeacherRecord[] }) {
  const { t } = useI18n();
  const linkedAccount = props.accounts.find((account) =>
    account.traceTraderList.some((item) => item.id === props.trader.id),
  );
  const targetAccountId = linkedAccount?.id ?? props.accounts[0]?.id;
  const hasLink = Boolean(linkedAccount);

  if (props.accounts.length === 0) {
    return (
      <Button size="sm" variant="outline" render={<Link to="/app/accounts" />} nativeButton={false}>
        {t("accounts.follow.linkAccountFirst")}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={hasLink ? "secondary" : "outline"}
        render={
          <Link
            to="/app/accounts/$accountId"
            params={{ accountId: targetAccountId! }}
            search={{
              tab: "follow",
              ...(hasLink ? {} : { addTrader: props.trader.id }),
            }}
          />
        }
        nativeButton={false}
      >
        {hasLink ? t("accounts.follow.editInAccount") : t("accounts.follow.configureInAccount")}
      </Button>
      {linkedAccount ? (
        <span className="text-xs text-muted-foreground">{linkedAccount.name}</span>
      ) : null}
    </div>
  );
}
