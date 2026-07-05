import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import {
  AccountDetailHeader,
  AccountFollowPanel,
  AccountOverviewPanel,
  AccountPositionsPanel,
  AccountSettingsPanel,
} from "#/components/trading/account-panels";
import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useI18n } from "#/lib/i18n";
import { getNextExecutionMode } from "#/lib/trading/execution-mode";
import { getExecutionModeLabel } from "#/lib/trading/execution-mode-labels";
import {
  accountEventsQueryOptions,
  accountsQueryOptions,
  allTradersQueryOptions,
} from "#/lib/trading/queries";
import {
  $refreshTeacherAccount,
  $removeTeacher,
  $updateTeacherExecution,
} from "#/lib/trading/repository";

const accountDetailSearchSchema = z.object({
  tab: z.enum(["overview", "follow", "positions", "settings"]).optional().catch("overview"),
  addTrader: z.string().optional(),
});

export const Route = createFileRoute("/_auth/app/accounts/$accountId")({
  validateSearch: accountDetailSearchSchema,
  loader: async ({ context, params }) => {
    const [accounts, traders] = await Promise.all([
      context.queryClient.ensureQueryData(accountsQueryOptions()),
      context.queryClient.ensureQueryData(allTradersQueryOptions()),
    ]);
    const account = accounts.find((item) => item.id === params.accountId);
    const events = account
      ? await context.queryClient.ensureQueryData(accountEventsQueryOptions(account.id))
      : [];

    return { account, traders, events };
  },
  component: AccountDetailPage,
});

type AccountTab = z.infer<typeof accountDetailSearchSchema>["tab"];

function AccountDetailPage() {
  const { account, traders, events } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { t } = useI18n();
  const tab = search.tab ?? "overview";

  const setTab = (nextTab: NonNullable<AccountTab>) => {
    void navigate({
      search: (current) => ({
        ...current,
        tab: nextTab,
      }),
      replace: true,
    });
  };

  if (!account) {
    return (
      <TradingPageShell title={t("accounts.pageTitle")} description={t("accounts.notFound")}>
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/app/accounts" />}
          nativeButton={false}
        >
          {t("accounts.detail.back")}
        </Button>
      </TradingPageShell>
    );
  }

  const currentMode = account.executionMode ?? "dry-run";
  const nextMode = getNextExecutionMode(currentMode, account.platform);
  const nextModeLabel = getExecutionModeLabel(nextMode, t);

  const invalidate = async () => {
    await router.invalidate();
  };

  return (
    <TradingPageShell title={account.name} description={t("accounts.pageDescription")}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/app/accounts" />}
          nativeButton={false}
        >
          {t("accounts.detail.back")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await $updateTeacherExecution({
              data: {
                teacherId: account.id,
                executionMode: nextMode,
              },
            });
            await invalidate();
          }}
        >
          {t("accounts.executionMode.switch", { mode: nextModeLabel })}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await $refreshTeacherAccount({
              data: { teacherId: account.id },
            });
            await invalidate();
          }}
        >
          {t("accounts.refreshAccount")}
        </Button>
      </div>

      <AccountDetailHeader account={account} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as NonNullable<AccountTab>)}>
        <TabsList>
          <TabsTrigger value="overview">{t("accounts.tab.overview")}</TabsTrigger>
          <TabsTrigger value="follow">{t("accounts.tab.follow")}</TabsTrigger>
          <TabsTrigger value="positions">{t("accounts.tab.positions")}</TabsTrigger>
          <TabsTrigger value="settings">{t("accounts.tab.settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AccountOverviewPanel
            account={account}
            traders={traders}
            events={events}
            onManageFollows={() => setTab("follow")}
          />
        </TabsContent>

        <TabsContent value="follow">
          <AccountFollowPanel
            account={account}
            traders={traders}
            preferredTraderId={search.addTrader}
            onSubmitted={async () => {
              if (search.addTrader) {
                await navigate({
                  search: (current) => ({
                    ...current,
                    addTrader: undefined,
                  }),
                  replace: true,
                });
              }
              await invalidate();
            }}
          />
        </TabsContent>

        <TabsContent value="positions">
          <AccountPositionsPanel account={account} traders={traders} />
        </TabsContent>

        <TabsContent value="settings">
          <AccountSettingsPanel
            account={account}
            onSubmitted={invalidate}
            onRemove={async () => {
              await $removeTeacher({
                data: { teacherId: account.id },
              });
              await router.navigate({ to: "/app/accounts" });
            }}
          />
        </TabsContent>
      </Tabs>
    </TradingPageShell>
  );
}
