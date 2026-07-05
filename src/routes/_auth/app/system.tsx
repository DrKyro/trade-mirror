import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import {
  legacyCountsQueryOptions,
  legacyUserAccountSettingQueryOptions,
} from "#/lib/messages/queries";
import {
  $runDiscoverCrawlerOnce,
  $startDiscoverCrawler,
  $stopDiscoverCrawler,
} from "#/lib/trading/discover-repository";
import {
  bybitRuntimeStatusQueryOptions,
  discoverDataStatusQueryOptions,
  marketSubscriptionsQueryOptions,
  notificationConfigQueryOptions,
  refreshSchedulerQueryOptions,
  runtimeEventsQueryOptions,
  runtimeStatusQueryOptions,
} from "#/lib/trading/queries";
import {
  $refreshAllSupportedTraderPositions,
  $startRefreshScheduler,
  $stopRefreshScheduler,
  $updateNotificationRoutes,
} from "#/lib/trading/repository";
import type { RuntimeEvent } from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/system")({
  loader: async ({ context }) => {
    const [
      runtimeStatus,
      runtimeEvents,
      refreshScheduler,
      marketSubscriptions,
      notificationConfig,
      bybitRuntimeStatus,
      legacyCounts,
      legacyAccountSetting,
      discoverDataStatus,
    ] = await Promise.all([
      context.queryClient.ensureQueryData(runtimeStatusQueryOptions()),
      context.queryClient.ensureQueryData(runtimeEventsQueryOptions()),
      context.queryClient.ensureQueryData(refreshSchedulerQueryOptions()),
      context.queryClient.ensureQueryData(marketSubscriptionsQueryOptions()),
      context.queryClient.ensureQueryData(notificationConfigQueryOptions()),
      context.queryClient.ensureQueryData(bybitRuntimeStatusQueryOptions()),
      context.queryClient.ensureQueryData(legacyCountsQueryOptions()),
      context.queryClient.ensureQueryData(legacyUserAccountSettingQueryOptions()),
      context.queryClient.ensureQueryData(discoverDataStatusQueryOptions()),
    ]);
    return {
      runtimeStatus,
      runtimeEvents,
      refreshScheduler,
      marketSubscriptions,
      notificationConfig,
      bybitRuntimeStatus,
      legacyCounts,
      legacyAccountSetting,
      discoverDataStatus,
    };
  },
  component: SystemPage,
});

function SystemPage() {
  const {
    runtimeStatus,
    runtimeEvents,
    refreshScheduler,
    marketSubscriptions,
    notificationConfig,
    bybitRuntimeStatus,
    legacyCounts,
    legacyAccountSetting,
    discoverDataStatus,
  } = Route.useLoaderData();
  const router = useRouter();
  const { t } = useI18n();
  const text = useSystemText();
  const [scopeFilter, setScopeFilter] = useState<"all" | RuntimeEvent["scope"]>("all");
  const [levelFilter, setLevelFilter] = useState<"all" | RuntimeEvent["level"]>("all");
  const [routeDrafts, setRouteDrafts] = useState(() => ({
    default: notificationConfig.routeSummary.default.join(", "),
    traderChange: notificationConfig.routeSummary["trader-change"].join(", "),
    runtimeWarning: notificationConfig.routeSummary["runtime-warning"].join(", "),
    startup: notificationConfig.routeSummary.startup.join(", "),
    bybitAttention: notificationConfig.routeSummary["bybit-attention"].join(", "),
  }));

  const filteredEvents = runtimeEvents.filter((event) => {
    const scopeOk = scopeFilter === "all" || event.scope === scopeFilter;
    const levelOk = levelFilter === "all" || event.level === levelFilter;
    return scopeOk && levelOk;
  });

  return (
    <TradingPageShell title={t("system.title")} description={t("system.description")}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusTile label={text.postgresql} ok={runtimeStatus.mongoConnected} />
        <StatusTile label={text.traderSpyFeed} ok={runtimeStatus.traderSpyConnected} />
        <StatusTile label={text.followEngine} ok={runtimeStatus.followEngineRunning} />
        <StatusTile
          label={text.lastHeartbeat}
          ok={runtimeStatus.lastHeartbeat !== null}
          value={
            runtimeStatus.lastHeartbeat
              ? new Date(runtimeStatus.lastHeartbeat).toLocaleString()
              : text.notReceived
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatusTile
          label={text.legacyMessages}
          ok={legacyCounts.messageCount > 0}
          value={String(legacyCounts.messageCount)}
        />
        <StatusTile
          label={text.legacyChainInfo}
          ok={legacyCounts.chainCount > 0}
          value={String(legacyCounts.chainCount)}
        />
        <StatusTile
          label={text.legacyAccount}
          ok={Boolean(legacyAccountSetting)}
          value={legacyAccountSetting ? text.configured : text.empty}
        />
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{text.currentRuntimeConfig}</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <KeyValue label={text.websocketServer}>{runtimeStatus.wsServerUrl}</KeyValue>
          <KeyValue label={text.httpPort}>{String(runtimeStatus.httpPort)}</KeyValue>
        </dl>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{text.notificationSinks}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text.notificationSinksDescription}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {text.providersLabel}:{" "}
            {notificationConfig.enabledProviders.length > 0
              ? notificationConfig.enabledProviders.join(", ")
              : text.noneConfigured}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label="Feishu"
            ok={notificationConfig.feishuEnabled}
            value={notificationConfig.feishuEnabled ? text.configured : text.off}
          />
          <StatusTile
            label="Telegram"
            ok={notificationConfig.telegramEnabled}
            value={notificationConfig.telegramEnabled ? text.configured : text.off}
          />
          <StatusTile
            label="Discord"
            ok={notificationConfig.discordEnabled}
            value={notificationConfig.discordEnabled ? text.configured : text.off}
          />
          <StatusTile
            label={text.traderAlerts}
            ok={notificationConfig.traderChangeAlertsEnabled}
            value={notificationConfig.traderChangeAlertsEnabled ? text.enabled : text.disabled}
          />
        </div>

        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <KeyValue label={text.warnAlerts}>
            {notificationConfig.warningAlertsEnabled ? text.enabled : text.disabled}
          </KeyValue>
          <KeyValue label={text.startupAlerts}>
            {notificationConfig.startupAlertsEnabled ? text.enabled : text.disabled}
          </KeyValue>
          <KeyValue label={text.traderChangeRoute}>
            {notificationConfig.routeSummary["trader-change"].join(", ") || text.none}
          </KeyValue>
          <KeyValue label={text.bybitAttentionRoute}>
            {notificationConfig.routeSummary["bybit-attention"].join(", ") || text.none}
          </KeyValue>
        </dl>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <RouteInput
            label={text.defaultRoute}
            value={routeDrafts.default}
            onChange={(value) => setRouteDrafts((current) => ({ ...current, default: value }))}
          />
          <RouteInput
            label={text.traderChangeRoute}
            value={routeDrafts.traderChange}
            onChange={(value) => setRouteDrafts((current) => ({ ...current, traderChange: value }))}
          />
          <RouteInput
            label={text.runtimeWarningRoute}
            value={routeDrafts.runtimeWarning}
            onChange={(value) =>
              setRouteDrafts((current) => ({ ...current, runtimeWarning: value }))
            }
          />
          <RouteInput
            label={text.startupRoute}
            value={routeDrafts.startup}
            onChange={(value) => setRouteDrafts((current) => ({ ...current, startup: value }))}
          />
          <RouteInput
            label={text.bybitAttentionRoute}
            value={routeDrafts.bybitAttention}
            onChange={(value) =>
              setRouteDrafts((current) => ({ ...current, bybitAttention: value }))
            }
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const toProviders = (value: string) =>
                value
                  .split(",")
                  .map((item) => item.trim().toLowerCase())
                  .filter(
                    (item): item is "feishu" | "telegram" | "discord" =>
                      item === "feishu" || item === "telegram" || item === "discord",
                  );

              const overrides = {
                default: toProviders(routeDrafts.default),
                "trader-change": toProviders(routeDrafts.traderChange),
                "runtime-warning": toProviders(routeDrafts.runtimeWarning),
                startup: toProviders(routeDrafts.startup),
                "bybit-attention": toProviders(routeDrafts.bybitAttention),
              };

              await $updateNotificationRoutes({
                data: {
                  overrides,
                },
              });
              toast.success(text.notificationRoutesUpdated);
              await router.invalidate();
            }}
          >
            {text.saveRouteOverrides}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{text.bybitBrowserFallback}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text.bybitBrowserFallbackDescription}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {text.lastTrader}: {bybitRuntimeStatus.lastTraderId ?? text.none}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label={text.lastStatus}
            ok={
              bybitRuntimeStatus.lastStatus === "api-success" ||
              bybitRuntimeStatus.lastStatus === "browser-success"
            }
            value={formatBybitStatus(bybitRuntimeStatus.lastStatus, text)}
          />
          <StatusTile
            label={text.lastMode}
            ok={bybitRuntimeStatus.lastMode !== null}
            value={formatBybitMode(bybitRuntimeStatus.lastMode, text)}
          />
          <StatusTile
            label={text.lastAttempt}
            ok={bybitRuntimeStatus.lastAttemptAt !== null}
            value={
              bybitRuntimeStatus.lastAttemptAt
                ? new Date(bybitRuntimeStatus.lastAttemptAt).toLocaleString()
                : text.never
            }
          />
          <StatusTile
            label={text.lastSuccess}
            ok={bybitRuntimeStatus.lastSuccessAt !== null}
            value={
              bybitRuntimeStatus.lastSuccessAt
                ? new Date(bybitRuntimeStatus.lastSuccessAt).toLocaleString()
                : text.never
            }
          />
        </div>

        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <KeyValue label={text.detail}>{bybitRuntimeStatus.lastDetail ?? text.none}</KeyValue>
          <KeyValue label={text.screenshotPath}>
            {bybitRuntimeStatus.lastScreenshotPath ?? text.none}
          </KeyValue>
        </dl>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{text.traderRefreshScheduler}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text.traderRefreshSchedulerDescription}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await $refreshAllSupportedTraderPositions();
                if (result.failed.length > 0) {
                  toast.error(text.bulkRefreshFinishedWithFailures(result.failed.length));
                } else {
                  toast.success(text.bulkRefreshCompleted(result.refreshedTraderIds.length));
                }
                await router.invalidate();
              }}
            >
              {text.refreshAllTraders}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await $startRefreshScheduler();
                await router.invalidate();
              }}
              disabled={refreshScheduler.running}
            >
              {text.startScheduler}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await $stopRefreshScheduler();
                await router.invalidate();
              }}
              disabled={!refreshScheduler.running}
            >
              {text.stopScheduler}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label={text.schedulerStatus}
            ok={refreshScheduler.running}
            value={refreshScheduler.running ? text.running : text.stopped}
          />
          <StatusTile
            label={text.lastCompleted}
            ok={refreshScheduler.lastCompletedAt !== null}
            value={
              refreshScheduler.lastCompletedAt
                ? new Date(refreshScheduler.lastCompletedAt).toLocaleString()
                : text.notYet
            }
          />
          <StatusTile
            label={text.iterations}
            ok={refreshScheduler.iterationCount > 0}
            value={String(refreshScheduler.iterationCount)}
          />
          <StatusTile
            label={text.pollInterval}
            ok
            value={`${Math.round(refreshScheduler.pollIntervalMs / 1000)}s`}
          />
        </div>

        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <KeyValue label={text.supportedPlatforms}>
            {refreshScheduler.supportedPlatforms.join(", ")}
          </KeyValue>
          <KeyValue label={text.activePlatforms}>
            {refreshScheduler.activePlatforms.length > 0
              ? refreshScheduler.activePlatforms.join(", ")
              : text.none}
          </KeyValue>
          <KeyValue label={text.lastStarted}>
            {refreshScheduler.lastStartedAt
              ? new Date(refreshScheduler.lastStartedAt).toLocaleString()
              : text.never}
          </KeyValue>
          <KeyValue label={text.lastError}>{refreshScheduler.lastError ?? text.none}</KeyValue>
        </dl>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{text.discoverCrawler}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text.discoverCrawlerDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await $runDiscoverCrawlerOnce();
                toast.success(text.discoverCrawlerRunOnceDone);
                await router.invalidate();
              }}
            >
              {text.discoverCrawlerRunOnce}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await $startDiscoverCrawler();
                await router.invalidate();
              }}
              disabled={discoverDataStatus.crawler.running}
            >
              {text.startScheduler}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await $stopDiscoverCrawler();
                await router.invalidate();
              }}
              disabled={!discoverDataStatus.crawler.running}
            >
              {text.stopScheduler}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label={text.schedulerStatus}
            ok={discoverDataStatus.crawler.running}
            value={discoverDataStatus.crawler.running ? text.running : text.stopped}
          />
          <StatusTile
            label={text.discoverRankCache}
            ok={discoverDataStatus.rankCache.totalCached > 0}
            value={String(discoverDataStatus.rankCache.totalCached)}
          />
          <StatusTile
            label={text.discoverDeepCache}
            ok={discoverDataStatus.deepCache.totalCached > 0}
            value={String(discoverDataStatus.deepCache.totalCached)}
          />
          <StatusTile
            label={text.pollInterval}
            ok
            value={`${Math.round(discoverDataStatus.crawler.intervalMs / 60_000)}m`}
          />
        </div>

        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <KeyValue label={text.lastCompleted}>
            {discoverDataStatus.crawler.lastCompletedAt
              ? new Date(discoverDataStatus.crawler.lastCompletedAt).toLocaleString()
              : text.notYet}
          </KeyValue>
          <KeyValue label={text.discoverRankCachedAt}>
            {discoverDataStatus.rankCache.lastCrawledAt
              ? new Date(discoverDataStatus.rankCache.lastCrawledAt).toLocaleString()
              : text.notYet}
          </KeyValue>
          <KeyValue label={text.discoverDeepCachedAt}>
            {discoverDataStatus.deepCache.lastCrawledAt
              ? new Date(discoverDataStatus.deepCache.lastCrawledAt).toLocaleString()
              : text.notYet}
          </KeyValue>
          <KeyValue label={text.lastError}>
            {discoverDataStatus.crawler.lastError ?? text.none}
          </KeyValue>
          {discoverDataStatus.crawler.lastResultSummary ? (
            <KeyValue label={text.discoverLastRun}>
              {text.discoverLastRunSummary(
                discoverDataStatus.crawler.lastResultSummary.uniqueTraders,
                discoverDataStatus.crawler.lastResultSummary.deepSucceeded,
                discoverDataStatus.crawler.lastResultSummary.deepAttempted,
              )}
            </KeyValue>
          ) : null}
        </dl>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{text.marketSubscriptionState}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text.marketSubscriptionStateDescription}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {text.reconciled}{" "}
            {marketSubscriptions.lastReconciledAt
              ? new Date(marketSubscriptions.lastReconciledAt).toLocaleString()
              : text.never}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile
            label={text.activePlatforms}
            ok={marketSubscriptions.activePlatforms.length > 0}
            value={String(marketSubscriptions.activePlatforms.length)}
          />
          <StatusTile
            label={text.trackedSymbols}
            ok={marketSubscriptions.totalSymbols > 0}
            value={String(marketSubscriptions.totalSymbols)}
          />
          <StatusTile
            label={text.followRelations}
            ok={marketSubscriptions.totalRelations > 0}
            value={String(marketSubscriptions.totalRelations)}
          />
          <StatusTile label={text.source} ok value={marketSubscriptions.derivedFrom} />
        </div>

        <div className="mt-4 space-y-3">
          {marketSubscriptions.platforms.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              {text.noActiveSubscriptions}
            </div>
          ) : (
            marketSubscriptions.platforms.map((platformState) => (
              <div key={platformState.platform} className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="font-medium">{platformState.platform}</div>
                  <div className="text-sm text-muted-foreground">
                    {text.platformStateSummary(
                      platformState.symbolCount,
                      platformState.relationCount,
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <KeyValue label={text.symbols}>
                    {platformState.symbols.join(", ") || text.none}
                  </KeyValue>
                  <KeyValue label={text.teacherIds}>
                    {platformState.teacherIds.join(", ") || text.none}
                  </KeyValue>
                  <KeyValue label={text.lastMarkUpdate}>
                    {platformState.lastMarkUpdateAt
                      ? new Date(platformState.lastMarkUpdateAt).toLocaleString()
                      : text.never}
                  </KeyValue>
                  <KeyValue label={text.lastTraderSnapshot}>
                    {platformState.lastTraderSnapshotAt
                      ? new Date(platformState.lastTraderSnapshotAt).toLocaleString()
                      : text.never}
                  </KeyValue>
                </dl>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{text.runtimeEvents}</h2>
          <div className="text-sm text-muted-foreground">
            {text.eventsShown(filteredEvents.length)}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            className="h-8 rounded-2xl border bg-background px-3 text-sm"
            value={scopeFilter}
            onChange={(event) =>
              setScopeFilter(event.target.value as "all" | RuntimeEvent["scope"])
            }
          >
            <option value="all">{text.allScopes}</option>
            <option value="system">{text.scopeSystem}</option>
            <option value="trader-spy">{text.scopeTraderSpy}</option>
            <option value="follow-engine">{text.scopeFollowEngine}</option>
          </select>
          <select
            className="h-8 rounded-2xl border bg-background px-3 text-sm"
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value as "all" | RuntimeEvent["level"])
            }
          >
            <option value="all">{text.allLevels}</option>
            <option value="info">{text.levelInfo}</option>
            <option value="warn">{text.levelWarn}</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {filteredEvents.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      </div>
    </TradingPageShell>
  );
}

function StatusTile(props: { label: string; ok: boolean; value?: string }) {
  const text = useSystemText();

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{props.label}</div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${props.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
        <div className="text-lg font-semibold">
          {props.value ?? (props.ok ? text.ready : text.pending)}
        </div>
      </div>
    </div>
  );
}

function KeyValue(props: { label: string; children: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</dt>
      <dd className="mt-2 font-mono text-sm">{props.children}</dd>
    </div>
  );
}

function RouteInput(props: { label: string; value: string; onChange: (value: string) => void }) {
  const text = useSystemText();

  return (
    <label className="space-y-2">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</div>
      <input
        className="h-10 w-full rounded-2xl border bg-background px-3 text-sm"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={text.routePlaceholder}
      />
    </label>
  );
}

function EventRow(props: { event: RuntimeEvent }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
              props.event.level === "warn"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
            }`}
          >
            {props.event.scope}
          </span>
          <div className="font-medium">{props.event.title}</div>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date(props.event.timestamp).toLocaleString()}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{props.event.detail}</p>
    </div>
  );
}

function useSystemText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    isZh,
    postgresql: isZh ? "PostgreSQL" : "PostgreSQL",
    traderSpyFeed: isZh ? "Trader spy 数据源" : "Trader spy feed",
    followEngine: isZh ? "跟单引擎" : "Follow engine",
    lastHeartbeat: isZh ? "最后心跳" : "Last heartbeat",
    notReceived: isZh ? "尚未收到" : "not received",
    legacyMessages: isZh ? "旧消息数据" : "Legacy messages",
    legacyChainInfo: isZh ? "旧链上信息" : "Legacy chain info",
    legacyAccount: isZh ? "旧账户配置" : "Legacy account",
    configured: isZh ? "已配置" : "configured",
    empty: isZh ? "空" : "empty",
    currentRuntimeConfig: isZh ? "当前运行时配置" : "Current runtime config",
    websocketServer: isZh ? "WebSocket 服务地址" : "WebSocket server",
    httpPort: isZh ? "HTTP 端口" : "HTTP port",
    notificationSinks: isZh ? "通知通道" : "Notification sinks",
    notificationSinksDescription: isZh
      ? "旧版 Feishu、Telegram 和 Discord 发送链路已经接入到合并后的运行时。交易员仓位变动提醒和运行告警不再只留在本地事件日志里。"
      : "Legacy Feishu, Telegram, and Discord delivery paths are now available from the merged runtime. Trader position-change alerts and runtime warnings can leave the app instead of only remaining in the local event log.",
    providersLabel: isZh ? "已启用通道" : "Providers",
    noneConfigured: isZh ? "尚未配置" : "none configured",
    off: isZh ? "关闭" : "off",
    traderAlerts: isZh ? "交易员提醒" : "Trader alerts",
    enabled: isZh ? "启用" : "enabled",
    disabled: isZh ? "禁用" : "disabled",
    warnAlerts: isZh ? "告警提醒" : "Warn alerts",
    startupAlerts: isZh ? "启动提醒" : "Startup alerts",
    traderChangeRoute: isZh ? "交易员变动路由" : "Trader change route",
    bybitAttentionRoute: isZh ? "Bybit 关注路由" : "Bybit attention route",
    defaultRoute: isZh ? "默认路由" : "Default route",
    runtimeWarningRoute: isZh ? "运行告警路由" : "Runtime warning route",
    startupRoute: isZh ? "启动路由" : "Startup route",
    notificationRoutesUpdated: isZh
      ? "通知路由覆盖已更新。"
      : "Notification route overrides updated.",
    saveRouteOverrides: isZh ? "保存路由覆盖" : "Save route overrides",
    bybitBrowserFallback: isZh ? "Bybit 浏览器回退链路" : "Bybit browser fallback",
    bybitBrowserFallbackDescription: isZh
      ? "这里展示旧版 Bybit 浏览器登录路径的运行状态，帮助判断最近一次是 API 成功、浏览器回退成功，还是被登录权限拦住。"
      : "Operational visibility for the legacy Bybit browser-login path. This shows whether the merged runtime most recently succeeded via API or browser fallback, or whether it is blocked by login/access requirements.",
    lastTrader: isZh ? "最后一个交易员" : "Last trader",
    none: isZh ? "无" : "none",
    lastStatus: isZh ? "最后状态" : "Last status",
    lastMode: isZh ? "最后模式" : "Last mode",
    lastAttempt: isZh ? "最后尝试" : "Last attempt",
    lastSuccess: isZh ? "最后成功" : "Last success",
    never: isZh ? "从未" : "never",
    detail: isZh ? "详情" : "Detail",
    screenshotPath: isZh ? "截图路径" : "Screenshot path",
    traderRefreshScheduler: isZh ? "交易员刷新调度器" : "Trader Refresh Scheduler",
    traderRefreshSchedulerDescription: isZh
      ? "这是从 traderSpy 迁过来的后台轮询任务，会持续刷新 OKX、Bitget、Binance Futures 和 Bybit 的交易员数据，不需要手动逐个点刷新。"
      : "Background polling loop migrated from traderSpy. It keeps supported traders refreshed across OKX, Bitget, Binance Futures, and Bybit without requiring manual refresh clicks.",
    bulkRefreshFinishedWithFailures: (count: number) =>
      isZh
        ? `批量刷新完成，但有 ${count} 个失败项。请到系统事件里查看详情。`
        : `Bulk refresh finished with ${count} failure(s). Check System events for details.`,
    bulkRefreshCompleted: (count: number) =>
      isZh
        ? `已完成 ${count} 个交易员的批量刷新。`
        : `Bulk refresh completed for ${count} trader(s).`,
    refreshAllTraders: isZh ? "刷新全部交易员" : "Refresh all traders",
    startScheduler: isZh ? "启动调度器" : "Start scheduler",
    stopScheduler: isZh ? "停止调度器" : "Stop scheduler",
    schedulerStatus: isZh ? "调度器状态" : "Scheduler status",
    running: isZh ? "运行中" : "running",
    stopped: isZh ? "已停止" : "stopped",
    lastCompleted: isZh ? "上次完成时间" : "Last completed",
    notYet: isZh ? "尚未完成" : "not yet",
    iterations: isZh ? "执行轮次" : "Iterations",
    pollInterval: isZh ? "轮询间隔" : "Poll interval",
    supportedPlatforms: isZh ? "支持的平台" : "Supported platforms",
    activePlatforms: isZh ? "活跃平台" : "Active platforms",
    lastStarted: isZh ? "上次启动时间" : "Last started",
    lastError: isZh ? "最后错误" : "Last error",
    discoverCrawler: isZh ? "发现页爬虫" : "Discover crawler",
    discoverCrawlerDescription: isZh
      ? "按固定周期抓取排行榜和交易员深度数据，写入数据库。发现页和详情页只读缓存，不直接请求交易所。"
      : "Periodically crawls rank lists and trader deep analysis into the database. Discover pages read cache only and do not call exchanges directly.",
    discoverCrawlerRunOnce: isZh ? "立即爬取一轮" : "Run once now",
    discoverCrawlerRunOnceDone: isZh
      ? "发现爬虫已执行一轮。"
      : "Discover crawler finished one run.",
    discoverRankCache: isZh ? "排行榜缓存" : "Rank cache rows",
    discoverDeepCache: isZh ? "深度缓存" : "Deep cache rows",
    discoverRankCachedAt: isZh ? "排行榜更新时间" : "Rank cache updated",
    discoverDeepCachedAt: isZh ? "深度数据更新时间" : "Deep cache updated",
    discoverLastRun: isZh ? "上一轮结果" : "Last run",
    discoverLastRunSummary: (rankRows: number, deepOk: number, deepTotal: number) =>
      isZh
        ? `排行榜 ${rankRows} 人，深度 ${deepOk}/${deepTotal}`
        : `${rankRows} rank rows, deep ${deepOk}/${deepTotal}`,
    marketSubscriptionState: isZh ? "行情订阅状态" : "Market subscription state",
    marketSubscriptionStateDescription: isZh
      ? "这里根据交易员的实时跟单关系推导出当前行情订阅视图，用来替代旧版 `marketChild/subMarketTicker` 的运行态展示。"
      : "Derived from live trader follow relations. This replaces the old `marketChild/subMarketTicker` operational view with a persisted snapshot of which symbols are actively being watched for mark updates and stop-loss checks.",
    reconciled: isZh ? "最近对账" : "Reconciled",
    trackedSymbols: isZh ? "跟踪交易对" : "Tracked symbols",
    followRelations: isZh ? "跟单关系数" : "Follow relations",
    source: isZh ? "来源" : "Source",
    noActiveSubscriptions: isZh
      ? "当前没有任何交易员跟单关系在产出有效的行情订阅。"
      : "No active trader follow relations are currently producing market subscriptions.",
    platformStateSummary: (symbolCount: number, relationCount: number) =>
      isZh
        ? `${symbolCount} 个交易对，${relationCount} 条关系`
        : `${symbolCount} symbol(s), ${relationCount} relation(s)`,
    symbols: isZh ? "交易对" : "Symbols",
    teacherIds: isZh ? "交易员 ID" : "Trader ids",
    lastMarkUpdate: isZh ? "最后标记价格更新时间" : "Last mark update",
    lastTraderSnapshot: isZh ? "最后交易员快照" : "Last trader snapshot",
    runtimeEvents: isZh ? "运行时事件" : "Runtime events",
    eventsShown: (count: number) => (isZh ? `显示 ${count} 条事件` : `${count} events shown`),
    allScopes: isZh ? "全部范围" : "All scopes",
    scopeSystem: isZh ? "系统" : "system",
    scopeTraderSpy: isZh ? "trader-spy" : "trader-spy",
    scopeFollowEngine: isZh ? "follow-engine" : "follow-engine",
    allLevels: isZh ? "全部级别" : "All levels",
    levelInfo: isZh ? "信息" : "info",
    levelWarn: isZh ? "警告" : "warn",
    ready: isZh ? "正常" : "ready",
    pending: isZh ? "等待中" : "pending",
    routePlaceholder: "feishu,telegram,discord",
    bybitApiSuccess: isZh ? "API 成功" : "api-success",
    bybitBrowserSuccess: isZh ? "浏览器回退成功" : "browser-success",
    bybitBrowserRequired: isZh ? "需要浏览器回退" : "browser-required",
    bybitAccessDenied: isZh ? "访问被拒绝" : "access-denied",
    bybitApiMode: isZh ? "API" : "api",
    bybitBrowserMode: isZh ? "浏览器" : "browser",
  };
}

function formatBybitStatus(status: string | null, text: ReturnType<typeof useSystemText>) {
  switch (status) {
    case "api-success":
      return text.bybitApiSuccess;
    case "browser-success":
      return text.bybitBrowserSuccess;
    case "browser-required":
      return text.bybitBrowserRequired;
    case "access-denied":
      return text.bybitAccessDenied;
    case null:
      return text.none;
    default:
      return status;
  }
}

function formatBybitMode(mode: string | null, text: ReturnType<typeof useSystemText>) {
  if (mode == null) {
    return text.none;
  }

  if (mode === "api") {
    return text.bybitApiMode;
  }

  if (mode === "browser") {
    return text.bybitBrowserMode;
  }

  return mode;
}
