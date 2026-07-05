import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { TradingPageShell } from "#/components/trading/page-shell";
import {
  TraderDetailHeader,
  TraderOverviewPanel,
  TraderPositionsPanel,
  TraderSettingsPanel,
} from "#/components/trading/trader-panels";
import { Button } from "#/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useI18n } from "#/lib/i18n";
import { supportsLiveRefresh } from "#/lib/trading/platform-utils";
import { accountsQueryOptions, tradersQueryOptions } from "#/lib/trading/queries";
import {
  $deleteTrader,
  $refreshTraderPositions,
  $removeTrader,
  $updateTrader,
} from "#/lib/trading/repository";

const traderDetailSearchSchema = z.object({
  tab: z.enum(["overview", "positions", "settings"]).optional().catch("overview"),
});

export const Route = createFileRoute("/_auth/app/traders/$traderId")({
  validateSearch: traderDetailSearchSchema,
  loader: async ({ context, params }) => {
    const [traders, accounts] = await Promise.all([
      context.queryClient.ensureQueryData(tradersQueryOptions()),
      context.queryClient.ensureQueryData(accountsQueryOptions()),
    ]);
    const trader = traders.find((item) => item.id === params.traderId);
    return { trader, accounts };
  },
  component: TraderDetailPage,
});

type TraderTab = z.infer<typeof traderDetailSearchSchema>["tab"];

function TraderDetailPage() {
  const { trader, accounts } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { t } = useI18n();
  const tab = search.tab ?? "overview";

  const setTab = (nextTab: NonNullable<TraderTab>) => {
    void navigate({
      search: (current) => ({ ...current, tab: nextTab }),
      replace: true,
    });
  };

  const invalidate = async () => {
    await router.invalidate();
  };

  if (!trader) {
    return (
      <TradingPageShell title={t("traders.pageTitle")} description={t("traders.notFound")}>
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/app/traders" />}
          nativeButton={false}
        >
          {t("traders.detail.back")}
        </Button>
      </TradingPageShell>
    );
  }

  return (
    <TradingPageShell title={trader.name} description={t("traders.pageDescription")}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/app/traders" />}
          nativeButton={false}
        >
          {t("traders.detail.back")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await $updateTrader({
              data: {
                id: trader.id,
                strategyStatus: trader.strategyStatus === "follow" ? "watch" : "follow",
              },
            });
            await invalidate();
          }}
        >
          {trader.strategyStatus === "follow"
            ? t("traders.detail.setWatch")
            : t("traders.detail.setFollow")}
        </Button>
        {supportsLiveRefresh(trader.platform) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await $refreshTraderPositions({ data: { traderId: trader.id } });
                toast.success(t("traders.detail.refreshSuccess", { name: trader.name }));
                await invalidate();
              } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                toast.error(
                  t("traders.detail.refreshFailed", { name: trader.name, error: detail }),
                );
              }
            }}
          >
            {t("traders.detail.refreshPositions")}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await $removeTrader({ data: { traderId: trader.id } });
            await router.navigate({ to: "/app/traders" });
          }}
        >
          {t("traders.detail.removeFromWorkspace")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            await $deleteTrader({ data: { traderId: trader.id } });
            await router.navigate({ to: "/app/traders" });
          }}
        >
          {t("traders.detail.deleteGlobally")}
        </Button>
      </div>

      <TraderDetailHeader trader={trader} accounts={accounts} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as NonNullable<TraderTab>)}>
        <TabsList>
          <TabsTrigger value="overview">{t("traders.tab.overview")}</TabsTrigger>
          <TabsTrigger value="positions">{t("traders.tab.positions")}</TabsTrigger>
          <TabsTrigger value="settings">{t("traders.tab.settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TraderOverviewPanel trader={trader} accounts={accounts} />
        </TabsContent>

        <TabsContent value="positions">
          <TraderPositionsPanel trader={trader} />
        </TabsContent>

        <TabsContent value="settings">
          <TraderSettingsPanel trader={trader} onSubmitted={invalidate} />
        </TabsContent>
      </Tabs>
    </TradingPageShell>
  );
}
