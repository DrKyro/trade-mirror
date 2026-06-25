import { createFileRoute, Link } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AddTeacherForm } from "#/components/trading/add-teacher-form";
import { EditFollowRelationsForm } from "#/components/trading/edit-follow-relations-form";
import { TradingPageShell } from "#/components/trading/page-shell";
import {
  TeacherFollowSettingsForm,
  TraceTraderEditor,
} from "#/components/trading/teacher-follow-settings-form";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import {
  allTradersQueryOptions,
  teacherEventsQueryOptions,
  teachersQueryOptions,
} from "#/lib/trading/queries";
import {
  $remapTeacherFollowRelation,
  $refreshTeacherAccount,
  $removeTeacher,
  $unfollowTeacherTrader,
  $updateTeacherExecution,
  $updateTeacherSettings,
} from "#/lib/trading/repository";
import type {
  TeacherEquityHistory,
  FollowOrderRelation,
  PositionSnapshot,
  RuntimeEvent,
  TeacherRecord,
  TeacherPositionHistoryEntry,
  TraceTraderSetting,
  TraderRecord,
} from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/teachers")({
  loader: async ({ context }) => {
    const [teachers, traders] = await Promise.all([
      context.queryClient.ensureQueryData(teachersQueryOptions()),
      context.queryClient.ensureQueryData(allTradersQueryOptions()),
    ]);

    const teacherEvents = await Promise.all(
      teachers.map((teacher) =>
        context.queryClient.ensureQueryData(teacherEventsQueryOptions(teacher.id)),
      ),
    );

    return {
      teachers,
      traders,
      teacherEventsById: Object.fromEntries(
        teachers.map((teacher, index) => [teacher.id, teacherEvents[index]]),
      ),
    };
  },
  component: TeachersPage,
});

function TeachersPage() {
  const { teachers, traders, teacherEventsById } = Route.useLoaderData();
  const router = useRouter();
  const { t } = useI18n();

  return (
    <TradingPageShell title={t("teachers.title")} description={t("teachers.description")}>
      <AddTeacherForm
        onSubmitted={async () => {
          await router.invalidate();
        }}
      />

      <div className="grid gap-6">
        {teachers.map((teacher) => (
          <TeacherSection
            key={teacher.id}
            teacher={teacher}
            traders={traders}
            events={teacherEventsById[teacher.id] ?? []}
          />
        ))}
      </div>
    </TradingPageShell>
  );
}

function TeacherSection(props: {
  teacher: TeacherRecord;
  traders: TraderRecord[];
  events: RuntimeEvent[];
}) {
  const { teacher, traders, events } = props;
  const router = useRouter();
  const text = useTeachersText();

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">{teacher.name}</h2>
            <Badge>{teacher.platform}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {text.equityLabel(teacher.equity.toFixed(2))} ·{" "}
            {text.freeLabel(teacher.freeUsdt.toFixed(2))} ·{" "}
            {text.currentRiskLabel(`${(teacher.nowRiskRatio * 100).toFixed(2)}%`)}
          </p>
          <p className="text-sm text-muted-foreground">
            {text.executionLabel(formatExecutionMode(teacher.executionMode, text))} ·{" "}
            {text.credentialsLabel(
              teacher.credentials?.apiKey ? text.configured : text.notConfigured,
            )}
          </p>
        </div>
        <div className="grid min-w-[320px] grid-cols-2 gap-4">
          <Metric label={text.balance} value={teacher.balance.toFixed(2)} />
          <Metric label={text.unrealizedPnl} value={teacher.unrealizedPnl.toFixed(2)} />
          <Metric label={text.maxRisk} value={`${(teacher.maxRiskRatio * 100).toFixed(2)}%`} />
          <Metric label={text.traceTraders} value={String(teacher.traceTraderList.length)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <TeacherSettingsForm
          teacher={teacher}
          onSubmitted={async () => {
            await router.invalidate();
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await $updateTeacherExecution({
              data: {
                teacherId: teacher.id,
                executionMode: teacher.executionMode === "live" ? "dry-run" : "live",
              },
            });
            await router.invalidate();
          }}
        >
          {text.switchTo(
            formatExecutionMode(teacher.executionMode === "live" ? "dry-run" : "live", text),
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await $refreshTeacherAccount({
              data: {
                teacherId: teacher.id,
              },
            });
            await router.invalidate();
          }}
        >
          {text.refreshAccount}
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/teachers/$teacherId/logs" params={{ teacherId: teacher.id }} />}
          nativeButton={false}
        >
          {text.viewLogs}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            await $removeTeacher({
              data: {
                teacherId: teacher.id,
              },
            });
            await router.invalidate();
          }}
        >
          {text.removeTeacher}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">{text.followRelationships}</h3>
          <div className="mt-4">
            <EditFollowRelationsForm
              teacher={teacher}
              onSubmitted={async () => {
                await router.invalidate();
              }}
            />
          </div>
          <div className="mt-4 space-y-3">
            {teacher.followRelations.map((relation) => (
              <FollowRelationCard
                key={relation.orderId}
                teacher={teacher}
                relation={relation}
                traders={traders}
                onSubmitted={async () => {
                  await router.invalidate();
                }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">{text.traceTraderSettings}</h3>
          <div className="mt-4">
            <TeacherFollowSettingsForm
              teacher={teacher}
              traders={traders}
              onSubmitted={async () => {
                await router.invalidate();
              }}
            />
          </div>
          <div className="mt-4 space-y-3">
            {teacher.traceTraderList.map((setting) => (
              <TraceSettingCard
                key={setting.id}
                setting={setting}
                teacher={teacher}
                onSubmitted={async () => {
                  await router.invalidate();
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">{text.strategyDetail}</h3>
          <div className="text-xs text-muted-foreground">
            {text.configuredStrategies(teacher.traceTraderList.length)}
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {teacher.traceTraderList.length > 0 ? (
            teacher.traceTraderList.map((setting) => (
              <TeacherStrategyDetailCard
                key={setting.id}
                teacher={teacher}
                setting={setting}
                traders={traders}
              />
            ))
          ) : (
            <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              {text.noStrategyDetail}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold">{text.teacherAccountPositions}</h3>
            <div className="text-xs text-muted-foreground">
              {text.openPositionsCount(teacher.teacherPositions.length)}
            </div>
          </div>
          <div className="mt-4">
            <PositionSnapshotTable positions={teacher.teacherPositions} />
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold">{text.teacherFollowPositions}</h3>
            <div className="text-xs text-muted-foreground">
              {text.trackedPositionsCount(teacher.positions.length)}
            </div>
          </div>
          <div className="mt-4">
            <TeacherFollowPositionsTable
              positions={teacher.positions}
              relations={teacher.followRelations}
              traders={traders}
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/20 p-4 xl:col-span-2">
          <h3 className="text-sm font-semibold">{text.equityHistory}</h3>
          <div className="mt-4">
            <TeacherEquityHistoryPanel history={teacher.equityHistory} />
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/20 p-4 xl:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold">{text.positionHistory}</h3>
            <div className="text-xs text-muted-foreground">
              {text.recentEntries(teacher.positionHistory.length)}
            </div>
          </div>
          <div className="mt-4">
            <TeacherPositionHistoryTable entries={teacher.positionHistory} traders={traders} />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">{text.teacherActivityLog}</h3>
          <div className="text-xs text-muted-foreground">{text.recentEntries(events.length)}</div>
        </div>
        <div className="mt-4 space-y-3">
          {events.length > 0 ? (
            events.map((event) => <TeacherEventRow key={event.id} event={event} />)
          ) : (
            <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              {text.noStructuredLogEntries}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TeacherStrategyDetailCard(props: {
  teacher: TeacherRecord;
  setting: TraceTraderSetting;
  traders: TraderRecord[];
}) {
  const text = useTeachersText();
  const trader = props.traders.find((item) => item.id === props.setting.id);
  const strategyRelations = props.teacher.followRelations.filter(
    (relation) => relation.followTraderId === props.setting.id,
  );
  const traderPositions = trader?.positions ?? [];
  const riskRatio =
    props.teacher.equity > 0 && props.setting.stopLossUsdt > 0
      ? (props.setting.stopLossUsdt / props.teacher.equity) * 100
      : 0;

  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold">{props.setting.name}</div>
            {trader ? <Badge>{trader.platform}</Badge> : null}
            <Badge tone={props.setting.followStatus === "following" ? "success" : "muted"}>
              {formatFollowStatus(props.setting.followStatus, text)}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {trader ? (
              <>{text.strategyWithTraderId(trader.strategyName, trader.id)}</>
            ) : (
              <>{text.traderRecordMissing(props.setting.id)}</>
            )}
          </div>
          {trader ? (
            <a
              className="text-sm text-primary underline-offset-4 hover:underline"
              href={trader.link}
              target="_blank"
              rel="noreferrer"
            >
              {text.openOriginalTraderPage}
            </a>
          ) : null}
        </div>

        <div className="grid min-w-[320px] gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label={text.traderBalance} value={trader ? trader.balance.toFixed(2) : text.na} />
          <Metric
            label={text.strategyUnrealized}
            value={props.setting.unrealizedProfitSum.toFixed(2)}
          />
          <Metric label={text.strategyProfit} value={props.setting.followProfit.toFixed(2)} />
          <Metric label={text.riskRatio} value={`${riskRatio.toFixed(2)}%`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
        <div>{text.orderModeLabel(formatTraceOrderMode(props.setting.traceOrderMode, text))}</div>
        <div>{text.fundsLabel(props.setting.funds.toFixed(2))}</div>
        <div>
          {props.setting.traceOrderMode === "fixed"
            ? text.fixedFundsLabel(props.setting.fixedFunds.toFixed(2))
            : text.traceRatioLabel(props.setting.tracePerRatio.toFixed(3))}
        </div>
        <div>
          {text.stopLossLabel(
            props.setting.stopLossUsdt.toFixed(2),
            props.setting.stopLossPositionValueRate.toFixed(3),
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{text.traderLivePositions}</div>
            <div className="text-xs text-muted-foreground">
              {trader?.positionUpdateTime
                ? text.updatedAt(new Date(trader.positionUpdateTime).toLocaleString())
                : text.neverRefreshed}
            </div>
          </div>
          <div className="mt-3">
            <PositionSnapshotTable positions={traderPositions} />
          </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{text.teacherTrackedPositions}</div>
            <div className="text-xs text-muted-foreground">
              {text.relationsCount(strategyRelations.length)}
            </div>
          </div>
          <div className="mt-3">
            <TeacherTrackedRelationsTable relations={strategyRelations} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TeacherEquityHistoryPanel(props: { history: TeacherEquityHistory }) {
  const text = useTeachersText();
  const [bucket, setBucket] = useState<keyof TeacherEquityHistory>("min");
  const points = props.history[bucket];
  const chartPoints = buildSparklinePoints(points);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(["min", "hour", "day"] as const).map((item) => (
          <Button
            key={item}
            size="sm"
            variant={bucket === item ? "default" : "outline"}
            onClick={() => setBucket(item)}
          >
            {text.bucketLabel(item)}
          </Button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border bg-background p-4">
        {points.length > 0 ? (
          <>
            <div className="h-56 w-full">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
              >
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  points={chartPoints}
                  className="text-emerald-500"
                />
              </svg>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatHistoryTime(points[0]?.t ?? null, bucket)}</span>
              <span>{formatHistoryTime(points.at(-1)?.t ?? null, bucket)}</span>
            </div>
          </>
        ) : (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            {text.noEquityHistory}
          </div>
        )}
      </div>

      {points.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label={text.latest} value={points.at(-1)!.e.toFixed(2)} />
          <Metric label={text.change} value={(points.at(-1)!.e - points[0]!.e).toFixed(2)} />
          <Metric label={text.samples} value={String(points.length)} />
        </div>
      ) : null}
    </div>
  );
}

function PositionSnapshotTable(props: { positions: TraderRecord["positions"] }) {
  const text = useTeachersText();
  if (props.positions.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
        {text.noTraderPositionsOpen}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.lever}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.entry}</th>
            <th className="px-3 py-2">{text.amount}</th>
            <th className="px-3 py-2">{text.margin}</th>
            <th className="px-3 py-2">{text.pnl}</th>
            <th className="px-3 py-2">{text.pnlRate}</th>
            <th className="px-3 py-2">{text.opened}</th>
          </tr>
        </thead>
        <tbody>
          {props.positions.map((position) => (
            <tr key={position.id} className="border-b last:border-0">
              <td className="px-3 py-2">{position.symbol}</td>
              <td className="px-3 py-2">{position.leverage}x</td>
              <td className="px-3 py-2">
                <Badge tone={position.positionSide === "long" ? "success" : "muted"}>
                  {formatPositionSide(position.positionSide, text)}
                </Badge>
              </td>
              <td className="px-3 py-2">{position.entryPrice.toFixed(2)}</td>
              <td className="px-3 py-2">{position.amount.toFixed(3)}</td>
              <td className="px-3 py-2">{(position.margin ?? 0).toFixed(2)}</td>
              <td className="px-3 py-2">
                <span className={(position.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {(position.pnl ?? 0).toFixed(2)}
                </span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={(position.pnlRatio ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}
                >
                  {((position.pnlRatio ?? 0) * 100).toFixed(2)}%
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
  );
}

function TeacherFollowPositionsTable(props: {
  positions: PositionSnapshot[];
  relations: TeacherRecord["followRelations"];
  traders: TraderRecord[];
}) {
  const text = useTeachersText();
  if (props.positions.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
        {text.noTeacherFollowPositions}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.order}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.entry}</th>
            <th className="px-3 py-2">{text.amount}</th>
            <th className="px-3 py-2">{text.margin}</th>
            <th className="px-3 py-2">{text.notional}</th>
            <th className="px-3 py-2">{text.opened}</th>
            <th className="px-3 py-2">{text.traderOrder}</th>
            <th className="px-3 py-2">{text.strategy}</th>
          </tr>
        </thead>
        <tbody>
          {props.positions.map((position) => {
            const relation = props.relations.find((item) => item.orderId === position.id);
            const trader = relation
              ? props.traders.find((item) => item.id === relation.followTraderId)
              : null;
            const margin =
              position.margin ??
              (position.leverage > 0
                ? (position.entryPrice * position.amount) / position.leverage
                : null);
            return (
              <tr key={position.id} className="border-b last:border-0">
                <td className="px-3 py-2">{position.id}</td>
                <td className="px-3 py-2">
                  <Badge tone={position.positionSide === "long" ? "success" : "muted"}>
                    {formatPositionSide(position.positionSide, text)}
                  </Badge>
                </td>
                <td className="px-3 py-2">{position.symbol}</td>
                <td className="px-3 py-2">{position.entryPrice.toFixed(2)}</td>
                <td className="px-3 py-2">{position.amount.toFixed(3)}</td>
                <td className="px-3 py-2">{margin == null ? text.na : margin.toFixed(2)}</td>
                <td className="px-3 py-2">{(position.entryPrice * position.amount).toFixed(2)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {position.openTime ? new Date(position.openTime).toLocaleString() : text.na}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {relation?.followOrderId ?? text.unmapped}
                </td>
                <td className="px-3 py-2">
                  {trader ? trader.strategyName : (relation?.followTraderId ?? text.na)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeacherTrackedRelationsTable(props: { relations: TeacherRecord["followRelations"] }) {
  const text = useTeachersText();
  if (props.relations.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
        {text.noTrackedPositionsForStrategy}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.order}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.open}</th>
            <th className="px-3 py-2">{text.mark}</th>
            <th className="px-3 py-2">{text.amount}</th>
            <th className="px-3 py-2">{text.pnl}</th>
            <th className="px-3 py-2">{text.opened}</th>
            <th className="px-3 py-2">{text.followOrder}</th>
          </tr>
        </thead>
        <tbody>
          {props.relations.map((relation) => (
            <tr key={relation.orderId} className="border-b last:border-0">
              <td className="px-3 py-2">{relation.orderId}</td>
              <td className="px-3 py-2">
                <Badge tone={relation.positionSide === "long" ? "success" : "muted"}>
                  {formatPositionSide(relation.positionSide, text)}
                </Badge>
              </td>
              <td className="px-3 py-2">{relation.symbol}</td>
              <td className="px-3 py-2">{relation.openAvgPrice.toFixed(2)}</td>
              <td className="px-3 py-2">{relation.markPrice.toFixed(2)}</td>
              <td className="px-3 py-2">{relation.amount.toFixed(3)}</td>
              <td className="px-3 py-2">
                <span
                  className={relation.unrealizedProfit >= 0 ? "text-emerald-600" : "text-rose-600"}
                >
                  {relation.unrealizedProfit.toFixed(2)}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {relation.openTime ? new Date(relation.openTime).toLocaleString() : text.na}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{relation.followOrderId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeacherPositionHistoryTable(props: {
  entries: TeacherPositionHistoryEntry[];
  traders: TraderRecord[];
}) {
  const text = useTeachersText();
  const rows = [...props.entries].reverse().slice(0, 50);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
        {text.noTeacherPositionHistory}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.order}</th>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.worth}</th>
            <th className="px-3 py-2">{text.amount}</th>
            <th className="px-3 py-2">{text.price}</th>
            <th className="px-3 py-2">{text.profit}</th>
            <th className="px-3 py-2">{text.result}</th>
            <th className="px-3 py-2">{text.strategy}</th>
            <th className="px-3 py-2">{text.time}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, index) => {
            const trader = props.traders.find((item) => item.id === entry.traderId);
            return (
              <tr
                key={`${entry.t}-${entry.orderId ?? "none"}-${index}`}
                className="border-b last:border-0"
              >
                <td className="px-3 py-2">
                  <Badge tone={entry.success === -1 ? "muted" : "success"}>
                    {entry.orderId ?? text.rejected}
                  </Badge>
                </td>
                <td className="px-3 py-2">{entry.symbol}</td>
                <td className="px-3 py-2">
                  <Badge tone={entry.side === "long" ? "success" : "muted"}>
                    {formatTradeSide(entry.side, text)}
                  </Badge>
                </td>
                <td className="px-3 py-2">{(entry.amount * entry.price).toFixed(2)}</td>
                <td className="px-3 py-2">{entry.amount.toFixed(3)}</td>
                <td className="px-3 py-2">{entry.price.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={entry.profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {entry.profit.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{entry.ps}</td>
                <td className="px-3 py-2">{trader?.strategyName ?? entry.traderId}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(entry.t).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeacherEventRow(props: { event: RuntimeEvent }) {
  return (
    <div className="rounded-xl border bg-background p-4 text-sm">
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
        <div className="text-xs text-muted-foreground">
          {new Date(props.event.timestamp).toLocaleString()}
        </div>
      </div>
      <p className="mt-2 text-muted-foreground">{props.event.detail}</p>
    </div>
  );
}

function FollowRelationCard(props: {
  teacher: TeacherRecord;
  relation: FollowOrderRelation;
  traders: TraderRecord[];
  onSubmitted?: () => Promise<void> | void;
}) {
  const text = useTeachersText();
  const trader = props.traders.find((item) => item.id === props.relation.followTraderId);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextFollowOrderId, setNextFollowOrderId] = useState(props.relation.followOrderId);

  return (
    <div className="rounded-xl border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium">
            {props.relation.symbol} · {formatPositionSide(props.relation.positionSide, text)}
          </div>
          <div className="text-muted-foreground">
            {text.localOrderWithTraderOrder(props.relation.orderId, props.relation.followOrderId)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium">{props.relation.amount.toFixed(3)}</div>
          <div className="text-muted-foreground">
            {text.pnlLabel(props.relation.unrealizedProfit.toFixed(2))}
          </div>
        </div>
      </div>
      <div className="mt-2 text-muted-foreground">
        {text.strategyLabel(trader?.strategyName ?? props.relation.followTraderId)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setEditing((current) => !current);
            setError(null);
            setNextFollowOrderId(props.relation.followOrderId);
          }}
        >
          {editing ? text.cancelRemap : text.remapOrder}
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await $remapTeacherFollowRelation({
                data: {
                  teacherId: props.teacher.id,
                  orderId: props.relation.orderId,
                  nextFollowOrderId: null,
                },
              });
              await props.onSubmitted?.();
            } catch (submissionError) {
              setError(
                submissionError instanceof Error
                  ? submissionError.message
                  : text.failedToClearRelationMapping,
              );
            } finally {
              setPending(false);
            }
          }}
          disabled={pending}
        >
          {text.clearMapping}
        </Button>
      </div>
      {editing ? (
        <form
          className="mt-3 grid gap-3 rounded-xl border bg-muted/20 p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await $remapTeacherFollowRelation({
                data: {
                  teacherId: props.teacher.id,
                  orderId: props.relation.orderId,
                  nextFollowOrderId,
                },
              });
              setEditing(false);
              await props.onSubmitted?.();
            } catch (submissionError) {
              setError(
                submissionError instanceof Error
                  ? submissionError.message
                  : text.failedToRemapFollowRelation,
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`remap-order-${props.teacher.id}-${props.relation.orderId}`}>
              {text.newTraderOrderId}
            </Label>
            <Input
              id={`remap-order-${props.teacher.id}-${props.relation.orderId}`}
              value={nextFollowOrderId}
              onChange={(event) => setNextFollowOrderId(event.target.value)}
              placeholder={text.pasteTraderOrderId}
            />
          </div>
          <div className="text-xs text-muted-foreground">{text.remapHint}</div>
          {error ? <div className="text-xs text-destructive">{error}</div> : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="xs"
              variant="outline"
              disabled={pending || !nextFollowOrderId}
            >
              {pending ? text.saving : text.saveRemap}
            </Button>
          </div>
        </form>
      ) : error ? (
        <div className="mt-3 text-xs text-destructive">{error}</div>
      ) : null}
    </div>
  );
}

function TraceSettingCard(props: {
  setting: TraceTraderSetting;
  teacher: TeacherRecord;
  onSubmitted?: () => void;
}) {
  const text = useTeachersText();
  return (
    <div className="rounded-xl border bg-background p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{props.setting.name}</div>
        <div className="flex items-center gap-2">
          <Badge tone={props.setting.followStatus === "following" ? "success" : "muted"}>
            {formatFollowStatus(props.setting.followStatus, text)}
          </Badge>
          <Button
            size="xs"
            variant="destructive"
            onClick={async () => {
              await $unfollowTeacherTrader({
                data: {
                  teacherId: props.teacher.id,
                  traderId: props.setting.id,
                },
              });
              props.onSubmitted?.();
            }}
          >
            {text.remove}
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-muted-foreground">
        <div>{text.modeLabel(formatTraceOrderMode(props.setting.traceOrderMode, text))}</div>
        <div>{text.ratioLabel(props.setting.tracePerRatio.toFixed(3))}</div>
        <div>{text.stopLossSingleLabel(props.setting.stopLossUsdt.toFixed(2))}</div>
        <div>{text.profitSingleLabel(props.setting.followProfit.toFixed(2))}</div>
      </div>
      <TraceTraderEditor
        teacher={props.teacher}
        setting={props.setting}
        onSubmitted={props.onSubmitted}
      />
    </div>
  );
}

function TeacherSettingsForm(props: { teacher: TeacherRecord; onSubmitted?: () => void }) {
  const text = useTeachersText();
  const [form, setForm] = useState({
    accountMaxRiskRate: String(props.teacher.settings.accountMaxRiskRate),
    safeMarginRate: String(props.teacher.settings.safeMarginRate),
    limitRiskRatio: String(props.teacher.settings.limitRiskRatio),
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/10 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await $updateTeacherSettings({
            data: {
              teacherId: props.teacher.id,
              settings: {
                accountMaxRiskRate: Number(form.accountMaxRiskRate),
                safeMarginRate: Number(form.safeMarginRate),
                limitRiskRatio: Number(form.limitRiskRatio),
              },
            },
          });
          props.onSubmitted?.();
        } finally {
          setPending(false);
        }
      }}
    >
      <NumericField
        label={text.accountMaxRisk}
        value={form.accountMaxRiskRate}
        onChange={(value) => setForm((current) => ({ ...current, accountMaxRiskRate: value }))}
      />
      <NumericField
        label={text.safeMarginRate}
        value={form.safeMarginRate}
        onChange={(value) => setForm((current) => ({ ...current, safeMarginRate: value }))}
      />
      <NumericField
        label={text.limitRiskRatio}
        value={form.limitRiskRatio}
        onChange={(value) => setForm((current) => ({ ...current, limitRiskRatio: value }))}
      />
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? text.saving : text.saveRiskSettings}
      </Button>
    </form>
  );
}

function NumericField(props: { label: string; value: string; onChange: (value: string) => void }) {
  const fieldId = props.label.toLowerCase().replaceAll(" ", "-");

  return (
    <div className="grid min-w-36 gap-2">
      <Label htmlFor={fieldId}>{props.label}</Label>
      <Input
        id={fieldId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
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

function useTeachersText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    equityLabel: (value: string) => (isZh ? `权益 ${value}` : `Equity ${value}`),
    freeLabel: (value: string) => (isZh ? `可用 ${value}` : `free ${value}`),
    currentRiskLabel: (value: string) => (isZh ? `当前风险 ${value}` : `current risk ${value}`),
    executionLabel: (value: string) => (isZh ? `执行 ${value}` : `Execution ${value}`),
    credentialsLabel: (value: string) => (isZh ? `凭证 ${value}` : `credentials ${value}`),
    configured: isZh ? "已配置" : "configured",
    notConfigured: isZh ? "未配置" : "not configured",
    balance: isZh ? "余额" : "Balance",
    unrealizedPnl: isZh ? "未实现盈亏" : "Unrealized PnL",
    maxRisk: isZh ? "最大风险" : "Max risk",
    traceTraders: isZh ? "跟随交易员数" : "Trace traders",
    switchTo: (value: string) => (isZh ? `切换为 ${value}` : `Switch to ${value}`),
    refreshAccount: isZh ? "刷新账户" : "Refresh account",
    viewLogs: isZh ? "查看日志" : "View logs",
    removeTeacher: isZh ? "移除交易员" : "Remove trader",
    followRelationships: isZh ? "跟单关系" : "Follow relationships",
    traceTraderSettings: isZh ? "跟随交易员设置" : "Trace trader settings",
    strategyDetail: isZh ? "策略详情" : "Strategy detail",
    configuredStrategies: (count: number) =>
      isZh ? `${count} 个已配置策略` : `${count} configured strategies`,
    noStrategyDetail: isZh
      ? "还没有策略详情。给这个交易员添加交易员后，这里会补齐旧版策略面板数据。"
      : "No strategy detail yet. Add traders to this trader to populate the legacy strategy panel.",
    teacherAccountPositions: isZh ? "交易员账户持仓" : "Trader account positions",
    openPositionsCount: (count: number) =>
      isZh ? `${count} 个开仓持仓` : `${count} open position(s)`,
    teacherFollowPositions: isZh ? "交易员跟单持仓" : "Trader follow positions",
    trackedPositionsCount: (count: number) =>
      isZh ? `${count} 个跟踪持仓` : `${count} tracked position(s)`,
    equityHistory: isZh ? "权益历史" : "Equity history",
    positionHistory: isZh ? "持仓历史" : "Position history",
    recentEntries: (count: number) => (isZh ? `${count} 条最近记录` : `${count} recent entries`),
    teacherActivityLog: isZh ? "交易员活动日志" : "Trader activity log",
    noStructuredLogEntries: isZh
      ? "暂时还没有结构化交易员日志记录。"
      : "No structured trader log entries yet.",
    following: isZh ? "跟随中" : "following",
    unfollow: isZh ? "停止跟随" : "unfollow",
    strategyWithTraderId: (strategyName: string, traderId: string) =>
      isZh
        ? `策略 ${strategyName} · 交易员 ID ${traderId}`
        : `strategy ${strategyName} · trader id ${traderId}`,
    traderRecordMissing: (traderId: string) =>
      isZh ? `缺少交易员记录：${traderId}` : `Trader record missing: ${traderId}`,
    openOriginalTraderPage: isZh ? "打开原始交易员页面" : "Open original trader page",
    traderBalance: isZh ? "交易员余额" : "Trader balance",
    strategyUnrealized: isZh ? "策略未实现收益" : "Strategy unrealized",
    strategyProfit: isZh ? "策略收益" : "Strategy profit",
    riskRatio: isZh ? "风险比例" : "Risk ratio",
    orderModeLabel: (value: string) => (isZh ? `下单模式：${value}` : `Order mode: ${value}`),
    fundsLabel: (value: string) => (isZh ? `资金：${value}` : `Funds: ${value}`),
    fixedFundsLabel: (value: string) => (isZh ? `固定资金：${value}` : `Fixed funds: ${value}`),
    traceRatioLabel: (value: string) => (isZh ? `跟单比例：${value}` : `Trace ratio: ${value}`),
    stopLossLabel: (usdt: string, rate: string) =>
      isZh ? `止损：${usdt} / ${rate}` : `Stop loss: ${usdt} / ${rate}`,
    traderLivePositions: isZh ? "交易员实时持仓" : "Trader live positions",
    updatedAt: (value: string) => (isZh ? `更新于 ${value}` : `updated ${value}`),
    neverRefreshed: isZh ? "尚未刷新" : "never refreshed",
    teacherTrackedPositions: isZh ? "交易员跟踪持仓" : "Trader tracked positions",
    relationsCount: (count: number) => (isZh ? `${count} 条关系` : `${count} relation(s)`),
    noEquityHistory: isZh ? "暂时还没有权益历史记录。" : "No equity history recorded yet.",
    latest: isZh ? "最新值" : "Latest",
    change: isZh ? "变化" : "Change",
    samples: isZh ? "样本数" : "Samples",
    noTraderPositionsOpen: isZh
      ? "当前没有交易员开仓持仓。"
      : "No trader positions currently open.",
    symbol: isZh ? "交易对" : "Symbol",
    lever: isZh ? "杠杆" : "Lever",
    side: isZh ? "方向" : "Side",
    entry: isZh ? "开仓价" : "Entry",
    amount: isZh ? "数量" : "Amount",
    margin: isZh ? "保证金" : "Margin",
    pnl: isZh ? "盈亏" : "PnL",
    pnlRate: isZh ? "盈亏率" : "PnL %",
    opened: isZh ? "开仓时间" : "Opened",
    na: isZh ? "暂无" : "n/a",
    noTeacherFollowPositions: isZh
      ? "当前没有跟踪到交易员的跟单持仓。"
      : "No trader follow positions currently tracked.",
    order: isZh ? "订单" : "Order",
    notional: isZh ? "名义价值" : "Notional",
    traderOrder: isZh ? "交易员订单" : "Trader order",
    strategy: isZh ? "策略" : "Strategy",
    unmapped: isZh ? "未映射" : "unmapped",
    noTrackedPositionsForStrategy: isZh
      ? "这个策略当前没有交易员跟踪持仓。"
      : "No trader tracked positions for this strategy.",
    open: isZh ? "开仓" : "Open",
    mark: isZh ? "标记价" : "Mark",
    followOrder: isZh ? "跟单订单" : "Follow order",
    noTeacherPositionHistory: isZh
      ? "暂时还没有交易员持仓历史记录。"
      : "No trader position history recorded yet.",
    worth: isZh ? "名义价值" : "Worth",
    price: isZh ? "价格" : "Price",
    profit: isZh ? "收益" : "Profit",
    result: isZh ? "结果" : "Result",
    time: isZh ? "时间" : "Time",
    rejected: isZh ? "拒绝" : "rejected",
    localOrderWithTraderOrder: (localOrder: string, traderOrder: string) =>
      isZh
        ? `本地订单 ${localOrder} · 交易员订单 ${traderOrder}`
        : `local order ${localOrder} · trader order ${traderOrder}`,
    pnlLabel: (value: string) => (isZh ? `盈亏 ${value}` : `PnL ${value}`),
    strategyLabel: (value: string) => (isZh ? `策略：${value}` : `strategy: ${value}`),
    cancelRemap: isZh ? "取消重映射" : "Cancel remap",
    remapOrder: isZh ? "重映射订单" : "Remap order",
    clearMapping: isZh ? "清除映射" : "Clear mapping",
    failedToClearRelationMapping: isZh ? "清除关系映射失败。" : "Failed to clear relation mapping.",
    failedToRemapFollowRelation: isZh ? "重映射跟单关系失败。" : "Failed to remap follow relation.",
    newTraderOrderId: isZh ? "新的交易员订单 ID" : "New trader order id",
    pasteTraderOrderId: isZh ? "粘贴交易员持仓/订单 ID" : "Paste a trader position/order id",
    remapHint: isZh
      ? "运行时会扫描这个交易员正在跟踪的交易员，并把本地订单重新绑定到当前持有该订单 ID 的交易员。"
      : "The runtime will scan traced traders on this trader and bind the local order to the trader that currently holds this order id.",
    saving: isZh ? "保存中..." : "Saving...",
    saveRemap: isZh ? "保存重映射" : "Save remap",
    remove: isZh ? "移除" : "Remove",
    modeLabel: (value: string) => (isZh ? `模式：${value}` : `mode: ${value}`),
    ratioLabel: (value: string) => (isZh ? `比例：${value}` : `ratio: ${value}`),
    stopLossSingleLabel: (value: string) => (isZh ? `止损：${value}` : `stop loss: ${value}`),
    profitSingleLabel: (value: string) => (isZh ? `收益：${value}` : `profit: ${value}`),
    accountMaxRisk: isZh ? "账户最大风险" : "Account max risk",
    safeMarginRate: isZh ? "安全保证金比例" : "Safe margin rate",
    limitRiskRatio: isZh ? "风险限制比例" : "Limit risk ratio",
    saveRiskSettings: isZh ? "保存风控设置" : "Save risk settings",
    bucketLabel: (value: keyof TeacherEquityHistory) => {
      if (value === "min") {
        return isZh ? "分钟" : "min";
      }

      if (value === "hour") {
        return isZh ? "小时" : "hour";
      }

      return isZh ? "天" : "day";
    },
    live: isZh ? "实盘" : "live",
    dryRun: isZh ? "模拟" : "dry-run",
    ratioMode: isZh ? "按比例" : "ratio",
    fixedMode: isZh ? "固定金额" : "fixed",
    long: isZh ? "多" : "long",
    short: isZh ? "空" : "short",
  };
}

function formatExecutionMode(
  mode: TeacherRecord["executionMode"] | null | undefined,
  text: ReturnType<typeof useTeachersText>,
) {
  return mode === "live" ? text.live : text.dryRun;
}

function formatFollowStatus(
  status: TraceTraderSetting["followStatus"],
  text: ReturnType<typeof useTeachersText>,
) {
  return status === "following" ? text.following : text.unfollow;
}

function formatTraceOrderMode(
  mode: TraceTraderSetting["traceOrderMode"],
  text: ReturnType<typeof useTeachersText>,
) {
  return mode === "fixed" ? text.fixedMode : text.ratioMode;
}

function formatPositionSide(side: "long" | "short", text: ReturnType<typeof useTeachersText>) {
  return side === "long" ? text.long : text.short;
}

function formatTradeSide(
  side: TeacherPositionHistoryEntry["side"],
  text: ReturnType<typeof useTeachersText>,
) {
  return side === "long" ? text.long : text.short;
}

function buildSparklinePoints(points: TeacherEquityHistory["min"]) {
  if (points.length <= 1) {
    return "0,50 100,50";
  }

  const values = points.map((point) => point.e);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - ((point.e - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function formatHistoryTime(timestamp: number | null, bucket: keyof TeacherEquityHistory) {
  if (!timestamp) {
    return "n/a";
  }

  const date = new Date(timestamp);
  if (bucket === "day") {
    return date.toLocaleDateString();
  }

  return date.toLocaleString([], {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
