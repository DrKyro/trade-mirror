import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "#/components/ui/card";
import { useI18n } from "#/lib/i18n";
import {
  getExecutionModeBadgeVariant,
  getExecutionModeLabel,
} from "#/lib/trading/execution-mode-labels";
import { getPlatformLabel } from "#/lib/trading/platform-utils";
import type { TeacherRecord } from "#/lib/trading/types";

export function AccountCard(props: { account: TeacherRecord }) {
  const { t } = useI18n();
  const { account } = props;
  const activeFollows = account.traceTraderList.filter(
    (item) => item.followStatus === "following",
  ).length;
  const executionMode = account.executionMode ?? "dry-run";
  const hasApi = Boolean(account.credentials?.apiKey);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{account.name}</CardTitle>
          <Badge variant="outline">{getPlatformLabel(account.platform)}</Badge>
          <Badge variant={getExecutionModeBadgeVariant(executionMode)}>
            {getExecutionModeLabel(executionMode, t)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold tracking-tight">
          {account.equity.toFixed(2)}{" "}
          <span className="text-sm font-normal text-muted-foreground">U</span>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>{t("accounts.followSummary", { count: activeFollows })}</span>
          <span>{t("accounts.positionSummary", { count: account.teacherPositions.length })}</span>
          <span>{hasApi ? t("accounts.apiConnected") : t("accounts.apiMissing")}</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/accounts/$accountId" params={{ accountId: account.id }} />}
          nativeButton={false}
        >
          {t("accounts.viewDetail")}
        </Button>
      </CardFooter>
    </Card>
  );
}
