import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AddTraderForm } from "#/components/trading/add-trader-form";
import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import { supportsLiveRefresh } from "#/lib/trading/platform-utils";
import {
  allTradersQueryOptions,
  runtimeStatusQueryOptions,
  teachersQueryOptions,
  tradersQueryOptions,
} from "#/lib/trading/queries";
import {
  $deleteTrader,
  $refreshTraderPositions,
  $removeTrader,
  $updateTeacherTraceTraders,
  $updateTrader,
} from "#/lib/trading/repository";
import type { TeacherRecord, TraceTraderSetting, TraderRecord } from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/strategies")({
  loader: async ({ context }) => {
    const [traders, allTraders, runtimeStatus, teachers] = await Promise.all([
      context.queryClient.ensureQueryData(tradersQueryOptions()),
      context.queryClient.ensureQueryData(allTradersQueryOptions()),
      context.queryClient.ensureQueryData(runtimeStatusQueryOptions()),
      context.queryClient.ensureQueryData(teachersQueryOptions()),
    ]);

    return { traders, allTraders, runtimeStatus, teachers };
  },
  component: StrategiesPage,
});

function StrategiesPage() {
  const { traders, allTraders, runtimeStatus, teachers } = Route.useLoaderData();
  const router = useRouter();
  const { t } = useI18n();
  const text = useStrategiesText();

  return (
    <TradingPageShell title={t("strategies.title")} description={t("strategies.description")}>
      <AddTraderForm
        onSubmitted={async () => {
          await router.invalidate();
        }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          label={text.spyWebsocket}
          value={runtimeStatus.traderSpyConnected ? text.connected : text.waiting}
        />
        <StatusCard
          label={text.followEngine}
          value={runtimeStatus.followEngineRunning ? text.running : text.offline}
        />
        <StatusCard label={text.myStrategies} value={String(traders.length)} />
        <StatusCard label={text.globalTraderPool} value={String(allTraders.length)} />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{text.myStrategies}</h2>
          <p className="text-sm text-muted-foreground">{text.myStrategiesDescription}</p>
        </div>
        <div className="grid gap-4">
          {traders.length > 0 ? (
            traders.map((trader) => (
              <TraderCard
                key={trader.id}
                trader={trader}
                teachers={teachers}
                onRemove={async () => {
                  await $removeTrader({
                    data: {
                      traderId: trader.id,
                    },
                  });
                  await router.invalidate();
                }}
                onDelete={async () => {
                  await $deleteTrader({
                    data: {
                      traderId: trader.id,
                    },
                  });
                  await router.invalidate();
                }}
              />
            ))
          ) : (
            <EmptyState message={text.noWorkspaceStrategies} />
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{text.globalTraderPool}</h2>
          <p className="text-sm text-muted-foreground">{text.globalTraderPoolDescription}</p>
        </div>
        <div className="grid gap-4">
          {allTraders.map((trader) => (
            <TraderPoolCard
              key={`${trader.id}-pool`}
              trader={trader}
              isLinked={traders.some((item) => item.id === trader.id)}
            />
          ))}
        </div>
      </section>
    </TradingPageShell>
  );
}

function TraderCard(props: {
  trader: TraderRecord;
  teachers: TeacherRecord[];
  onRemove: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { trader } = props;
  const router = useRouter();
  const text = useStrategiesText();

  return (
    <article className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">{trader.name}</h2>
            <Badge>{trader.platform}</Badge>
            <Badge tone={trader.strategyStatus === "follow" ? "success" : "muted"}>
              {formatStrategyStatus(trader.strategyStatus, text)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {trader.strategyName} · {text.riskLabel(trader.strategyRiskRate)} ·{" "}
            {text.lastUpdateLabel(
              trader.positionUpdateTime
                ? new Date(trader.positionUpdateTime).toLocaleString()
                : text.never,
            )}
          </p>
          <a
            className="text-sm text-primary underline-offset-4 hover:underline"
            href={trader.link}
            target="_blank"
            rel="noreferrer"
          >
            {text.openOriginalTraderPage}
          </a>
        </div>

        <div className="grid min-w-[280px] grid-cols-2 gap-4">
          <Metric label={text.balance} value={`${trader.balance.toFixed(2)} U`} />
          <Metric label={text.openPositions} value={String(trader.positions.length)} />
          <Metric
            label={text.monthlyAveragePositionValue}
            value={trader.monthlyAveragePositionValue.toFixed(2)}
          />
          <Metric
            label={text.threeMonthMaxDrawdown}
            value={trader.threeMonthMaxDrawdown.toFixed(2)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={trader.strategyStatus === "follow" ? "secondary" : "default"}
          onClick={async () => {
            await $updateTrader({
              data: {
                id: trader.id,
                strategyStatus: trader.strategyStatus === "follow" ? "watch" : "follow",
              },
            });
            await router.invalidate();
          }}
        >
          {trader.strategyStatus === "follow" ? text.setWatch : text.setFollow}
        </Button>
        {supportsLiveRefresh(trader.platform) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await $refreshTraderPositions({
                  data: {
                    traderId: trader.id,
                  },
                });
                toast.success(text.refreshSuccess(trader.name));
                await router.invalidate();
              } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                toast.error(text.refreshFailed(trader.name, detail));
                await router.invalidate();
              }
            }}
          >
            {text.refreshLivePositions}
          </Button>
        ) : null}
        <FollowTraderToTeacherAction
          trader={trader}
          teachers={props.teachers}
          onSubmitted={async () => {
            await router.invalidate();
          }}
        />
        <Button size="sm" variant="outline" onClick={() => void props.onRemove()}>
          {text.removeFromWorkspace}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => void props.onDelete()}>
          {text.deleteGlobally}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <StrategySettingsPanel
          trader={trader}
          onSubmitted={async () => {
            await router.invalidate();
          }}
        />
        <TraderPositionsPanel trader={trader} />
      </div>
    </article>
  );
}

function TraderPoolCard(props: { trader: TraderRecord; isLinked: boolean }) {
  const text = useStrategiesText();

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{props.trader.name}</div>
            <Badge>{props.trader.platform}</Badge>
            <Badge tone={props.isLinked ? "success" : "muted"}>
              {props.isLinked ? text.inWorkspace : text.sharedOnly}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {props.trader.strategyName} · {props.trader.id}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {props.trader.positionUpdateTime
            ? text.lastUpdateLabel(new Date(props.trader.positionUpdateTime).toLocaleString())
            : text.neverRefreshed}
        </div>
      </div>
    </article>
  );
}

function EmptyState(props: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
      {props.message}
    </div>
  );
}

function StatusCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</div>
      <div className="mt-2 text-lg font-semibold">{props.value}</div>
    </div>
  );
}

function Badge(props: { children: string; tone?: "success" | "muted" }) {
  const toneClass =
    props.tone === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {props.children}
    </span>
  );
}

function StrategySettingsPanel(props: {
  trader: TraderRecord;
  onSubmitted?: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    strategyName: props.trader.strategyName,
    strategyStatus: props.trader.strategyStatus,
    strategyRiskRate: String(props.trader.strategyRiskRate),
  });
  const [pending, setPending] = useState(false);
  const text = useStrategiesText();

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
        <h3 className="text-sm font-semibold">{text.strategySettings}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{text.strategySettingsDescription}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <StrategyField
          id={`strategy-name-${props.trader.id}`}
          label={text.displayName}
          value={form.strategyName}
          onChange={(value) => setForm((current) => ({ ...current, strategyName: value }))}
        />
        <div className="grid gap-2">
          <Label htmlFor={`strategy-status-${props.trader.id}`}>{text.status}</Label>
          <select
            id={`strategy-status-${props.trader.id}`}
            className="h-9 rounded-2xl border bg-background px-3 text-sm"
            value={form.strategyStatus}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                strategyStatus: event.target.value as TraderRecord["strategyStatus"],
              }))
            }
          >
            <option value="follow">{text.followStatusOption}</option>
            <option value="watch">{text.watchStatusOption}</option>
            <option value="disabled">{text.disabledStatusOption}</option>
          </select>
        </div>
        <StrategyField
          id={`strategy-risk-rate-${props.trader.id}`}
          label={text.riskRate}
          value={form.strategyRiskRate}
          onChange={(value) => setForm((current) => ({ ...current, strategyRiskRate: value }))}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? text.saving : text.saveStrategySettings}
        </Button>
      </div>
    </form>
  );
}

function FollowTraderToTeacherAction(props: {
  trader: TraderRecord;
  teachers: TeacherRecord[];
  onSubmitted?: () => Promise<void> | void;
}) {
  const existingTeacher = props.teachers.find((teacher) =>
    teacher.traceTraderList.some((item) => item.id === props.trader.id),
  );
  const selectedTeacherDefault = existingTeacher?.id ?? props.teachers[0]?.id ?? "";
  const existingSetting = existingTeacher?.traceTraderList.find(
    (item) => item.id === props.trader.id,
  );
  const [expanded, setExpanded] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState(selectedTeacherDefault);
  const [form, setForm] = useState({
    traceOrderMode: existingSetting?.traceOrderMode ?? "ratio",
    fixedFunds: String(existingSetting?.fixedFunds ?? 0),
    tracePerRatio: String(
      existingSetting?.tracePerRatio ?? deriveSuggestedTraceRatio(props.trader),
    ),
    stopLossUsdt: String(existingSetting?.stopLossUsdt ?? 0),
    stopLossPositionValueRate: String(existingSetting?.stopLossPositionValueRate ?? 0.05),
    funds: String(existingSetting?.funds ?? 0),
    followStatus: existingSetting?.followStatus ?? "following",
  });
  const [pending, setPending] = useState(false);
  const text = useStrategiesText();

  if (props.teachers.length === 0) {
    return (
      <Button size="sm" variant="outline" disabled>
        {text.addTeacherFirst}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setExpanded((current) => !current)}>
          {expanded
            ? text.hideFollowConfig
            : existingSetting
              ? text.editTeacherFollowConfig
              : text.addToTeacher}
        </Button>
        {existingTeacher ? (
          <span className="text-xs text-muted-foreground">
            {text.currentlyLinkedTo(existingTeacher.name)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{text.notLinkedToTeacher}</span>
        )}
      </div>

      {expanded ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const teacher = props.teachers.find((item) => item.id === selectedTeacherId);
            if (!teacher) {
              return;
            }

            const nextSetting: TraceTraderSetting = {
              id: props.trader.id,
              name: props.trader.name,
              funds: Number(form.funds),
              traceOrderMode: form.traceOrderMode,
              fixedFunds: Number(form.fixedFunds),
              tracePerRatio: Number(form.tracePerRatio),
              stopLossUsdt: Number(form.stopLossUsdt),
              stopLossPositionValueRate: Number(form.stopLossPositionValueRate),
              followStatus: form.followStatus,
              unrealizedProfitSum: existingSetting?.unrealizedProfitSum ?? 0,
              followProfit: existingSetting?.followProfit ?? 0,
            };

            const nextTraceTraderList = teacher.traceTraderList.some(
              (item) => item.id === props.trader.id,
            )
              ? teacher.traceTraderList.map((item) =>
                  item.id === props.trader.id ? nextSetting : item,
                )
              : [...teacher.traceTraderList, nextSetting];

            setPending(true);
            try {
              await $updateTeacherTraceTraders({
                data: {
                  teacherId: teacher.id,
                  traceTraderList: nextTraceTraderList,
                },
              });
              await props.onSubmitted?.();
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor={`teacher-select-${props.trader.id}`}>{text.teacher}</Label>
              <select
                id={`teacher-select-${props.trader.id}`}
                className="h-9 rounded-2xl border bg-background px-3 text-sm"
                value={selectedTeacherId}
                onChange={(event) => setSelectedTeacherId(event.target.value)}
                disabled={pending}
              >
                {props.teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`trace-mode-${props.trader.id}`}>{text.orderMode}</Label>
              <select
                id={`trace-mode-${props.trader.id}`}
                className="h-9 rounded-2xl border bg-background px-3 text-sm"
                value={form.traceOrderMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    traceOrderMode: event.target.value as TraceTraderSetting["traceOrderMode"],
                  }))
                }
                disabled={pending}
              >
                <option value="ratio">{text.ratioMode}</option>
                <option value="fixed">{text.fixedMode}</option>
              </select>
            </div>
            <StrategyField
              id={`stop-loss-usdt-${props.trader.id}`}
              label={text.stopLossUsdt}
              value={form.stopLossUsdt}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  stopLossUsdt: value,
                  tracePerRatio: deriveTraceRatioFromStopLoss(value, props.trader),
                }))
              }
            />
            <StrategyField
              id={`position-stop-loss-${props.trader.id}`}
              label={text.positionStopLoss}
              value={form.stopLossPositionValueRate}
              onChange={(value) =>
                setForm((current) => ({ ...current, stopLossPositionValueRate: value }))
              }
            />
            {form.traceOrderMode === "fixed" ? (
              <StrategyField
                id={`fixed-funds-${props.trader.id}`}
                label={text.fixedFunds}
                value={form.fixedFunds}
                onChange={(value) => setForm((current) => ({ ...current, fixedFunds: value }))}
              />
            ) : (
              <StrategyField
                id={`trace-ratio-${props.trader.id}`}
                label={text.traceRatio}
                value={form.tracePerRatio}
                onChange={(value) => setForm((current) => ({ ...current, tracePerRatio: value }))}
              />
            )}
            <StrategyField
              id={`funds-${props.trader.id}`}
              label={text.funds}
              value={form.funds}
              onChange={(value) => setForm((current) => ({ ...current, funds: value }))}
            />
            <div className="grid gap-2">
              <Label htmlFor={`follow-status-${props.trader.id}`}>{text.followStatus}</Label>
              <select
                id={`follow-status-${props.trader.id}`}
                className="h-9 rounded-2xl border bg-background px-3 text-sm"
                value={form.followStatus}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    followStatus: event.target.value as TraceTraderSetting["followStatus"],
                  }))
                }
                disabled={pending}
              >
                <option value="following">{text.following}</option>
                <option value="unfollow">{text.unfollow}</option>
              </select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {text.estimatedSingleOrderValue(
              (
                props.trader.monthlyAveragePositionValue * Number(form.tracePerRatio || "0")
              ).toFixed(2),
            )}
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!selectedTeacherId || pending}
            >
              {pending
                ? text.saving
                : existingSetting
                  ? text.updateFollowConfig
                  : text.addToTeacher}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function TraderPositionsPanel(props: { trader: TraderRecord }) {
  const text = useStrategiesText();

  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{text.openPositions}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text.positionsPanelDescription}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {text.openPositionCount(props.trader.positions.length)}
        </div>
      </div>
      {props.trader.positions.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-background">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">{text.order}</th>
                <th className="px-3 py-2">{text.symbol}</th>
                <th className="px-3 py-2">{text.amount}</th>
                <th className="px-3 py-2">{text.entry}</th>
                <th className="px-3 py-2">{text.side}</th>
                <th className="px-3 py-2">{text.lever}</th>
                <th className="px-3 py-2">{text.margin}</th>
                <th className="px-3 py-2">{text.pnl}</th>
                <th className="px-3 py-2">{text.openTime}</th>
              </tr>
            </thead>
            <tbody>
              {props.trader.positions.map((position) => (
                <tr key={position.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{position.id}</td>
                  <td className="px-3 py-2">{position.symbol}</td>
                  <td className="px-3 py-2">{position.amount.toFixed(3)}</td>
                  <td className="px-3 py-2">{position.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={position.positionSide === "long" ? "success" : "muted"}>
                      {formatPositionSide(position.positionSide, text)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{position.leverage}x</td>
                  <td className="px-3 py-2">{(position.margin ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={(position.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}
                    >
                      {(position.pnl ?? 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {position.openTime ? new Date(position.openTime).toLocaleString() : text.na}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          {text.noOpenPositions}
        </div>
      )}
    </div>
  );
}

function StrategyField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function deriveSuggestedTraceRatio(trader: TraderRecord) {
  if (!trader.threeMonthMaxDrawdown) {
    return 0.1;
  }

  return Number(Math.max(-(100 / trader.threeMonthMaxDrawdown), 0).toFixed(4));
}

function deriveTraceRatioFromStopLoss(stopLossUsdt: string, trader: TraderRecord) {
  const stopLoss = Number(stopLossUsdt);
  if (!(stopLoss > 0) || !trader.threeMonthMaxDrawdown) {
    return "0";
  }

  return Math.max(-(stopLoss / trader.threeMonthMaxDrawdown), 0).toFixed(4);
}

function useStrategiesText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    spyWebsocket: isZh ? "Trader spy WebSocket" : "Trader spy websocket",
    followEngine: isZh ? "跟单引擎" : "Follow engine",
    connected: isZh ? "已连接" : "connected",
    waiting: isZh ? "等待中" : "waiting",
    running: isZh ? "运行中" : "running",
    offline: isZh ? "离线" : "offline",
    myStrategies: isZh ? "我的策略" : "My strategies",
    globalTraderPool: isZh ? "全局交易员池" : "Global trader pool",
    myStrategiesDescription: isZh
      ? "这里是当前登录用户自己的策略工作区，对应旧后台里的用户专属工作台。"
      : "This is the current signed-in user's working strategy set, matching the legacy dashboard's user workspace idea.",
    globalTraderPoolDescription: isZh
      ? "这里展示整个合并运行时共享的交易员记录，供抓取、刷新和交易员跟单执行复用。"
      : "Shared trader records used by ingest, refresh, and trader follow execution across the merged runtime.",
    noWorkspaceStrategies: isZh
      ? "当前用户还没有关联任何策略。可以先在下面添加一个交易员，初始化工作区。"
      : "No strategies linked to this user yet. Add one below to seed the workspace.",
    openOriginalTraderPage: isZh ? "打开原始交易员页面" : "Open original trader page",
    riskLabel: (value: number) => (isZh ? `风险 ${value.toFixed(2)}` : `risk ${value.toFixed(2)}`),
    lastUpdateLabel: (value: string) => (isZh ? `最近更新 ${value}` : `last update ${value}`),
    balance: isZh ? "余额" : "Balance",
    openPositions: isZh ? "持仓数" : "Open positions",
    monthlyAveragePositionValue: isZh ? "月均持仓价值" : "Monthly avg pos value",
    threeMonthMaxDrawdown: isZh ? "3个月最大回撤" : "3M max drawdown",
    setWatch: isZh ? "设为观察" : "Set watch",
    setFollow: isZh ? "设为跟随" : "Set follow",
    refreshLivePositions: isZh ? "刷新实时持仓" : "Refresh live positions",
    refreshSuccess: (name: string) =>
      isZh ? `已刷新 ${name} 的实时持仓。` : `Refreshed ${name} live positions.`,
    refreshFailed: (name: string, detail: string) =>
      isZh ? `刷新 ${name} 失败：${detail}` : `Failed to refresh ${name}: ${detail}`,
    removeFromWorkspace: isZh ? "从我的工作区移除" : "Remove from my workspace",
    deleteGlobally: isZh ? "全局删除" : "Delete globally",
    inWorkspace: isZh ? "已在我的工作区" : "in my workspace",
    sharedOnly: isZh ? "仅共享池" : "shared only",
    neverRefreshed: isZh ? "尚未刷新" : "never refreshed",
    never: isZh ? "从未" : "never",
    strategySettings: isZh ? "策略设置" : "Strategy settings",
    strategySettingsDescription: isZh
      ? "旧版策略弹窗的核心配置已经内嵌到这里，方便直接在工作区里编辑。"
      : "Legacy strategy dialog behavior moved inline here for faster workspace edits.",
    displayName: isZh ? "显示名称" : "Display name",
    status: isZh ? "状态" : "Status",
    followStatusOption: isZh ? "跟随" : "follow",
    watchStatusOption: isZh ? "观察" : "watch",
    disabledStatusOption: isZh ? "停用" : "disabled",
    riskRate: isZh ? "风险系数" : "Risk rate",
    saving: isZh ? "保存中..." : "Saving...",
    saveStrategySettings: isZh ? "保存策略设置" : "Save strategy settings",
    addTeacherFirst: isZh ? "请先添加交易员账户" : "Add a trader first",
    hideFollowConfig: isZh ? "收起跟单配置" : "Hide follow config",
    editTeacherFollowConfig: isZh ? "编辑交易员跟单配置" : "Edit trader follow config",
    addToTeacher: isZh ? "添加到交易员" : "Add to trader",
    currentlyLinkedTo: (name: string) =>
      isZh ? `当前已关联到 ${name}` : `Currently linked to ${name}`,
    notLinkedToTeacher: isZh ? "还没有关联交易员账户" : "Not linked to a trader yet",
    teacher: isZh ? "交易员" : "Trader",
    orderMode: isZh ? "下单模式" : "Order mode",
    ratioMode: isZh ? "按比例" : "ratio",
    fixedMode: isZh ? "固定金额" : "fixed",
    stopLossUsdt: isZh ? "止损 USDT" : "Stop loss USDT",
    positionStopLoss: isZh ? "仓位止损比例" : "Position stop loss",
    fixedFunds: isZh ? "固定资金" : "Fixed funds",
    traceRatio: isZh ? "跟单比例" : "Trace ratio",
    funds: isZh ? "资金" : "Funds",
    followStatus: isZh ? "跟随状态" : "Follow status",
    following: isZh ? "跟随中" : "following",
    unfollow: isZh ? "停止跟随" : "unfollow",
    estimatedSingleOrderValue: (value: string) =>
      isZh ? `预估单笔下单价值：${value}` : `Estimated single-order value: ${value}`,
    updateFollowConfig: isZh ? "更新跟单配置" : "Update follow config",
    positionsPanelDescription: isZh
      ? "这里用常驻表格替代了旧版的持仓抽屉。"
      : "Replaces the legacy position drawer with an always-visible table.",
    openPositionCount: (count: number) =>
      isZh ? `${count} 个开仓持仓` : `${count} open position(s)`,
    order: isZh ? "订单" : "Order",
    symbol: isZh ? "交易对" : "Symbol",
    amount: isZh ? "数量" : "Amount",
    entry: isZh ? "开仓价" : "Entry",
    side: isZh ? "方向" : "Side",
    lever: isZh ? "杠杆" : "Lever",
    margin: isZh ? "保证金" : "Margin",
    pnl: isZh ? "盈亏" : "PnL",
    openTime: isZh ? "开仓时间" : "Open time",
    noOpenPositions: isZh ? "暂时没有开仓持仓。" : "No open positions yet.",
    na: isZh ? "暂无" : "n/a",
    long: isZh ? "多" : "long",
    short: isZh ? "空" : "short",
  };
}

function formatStrategyStatus(
  status: TraderRecord["strategyStatus"],
  text: ReturnType<typeof useStrategiesText>,
) {
  switch (status) {
    case "follow":
      return text.followStatusOption;
    case "watch":
      return text.watchStatusOption;
    case "disabled":
      return text.disabledStatusOption;
    default:
      return status;
  }
}

function formatPositionSide(
  side: TraderRecord["positions"][number]["positionSide"],
  text: ReturnType<typeof useStrategiesText>,
) {
  return side === "long" ? text.long : text.short;
}
