import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { AccountEquityChart } from "#/components/trading/account-equity-chart";
import { AccountFollowSettingsForm } from "#/components/trading/account-follow-settings-form";
import { CopyTargetSheet } from "#/components/trading/copy-target-sheet";
import { EditFollowRelationsForm } from "#/components/trading/edit-follow-relations-form";
import { MetricCard } from "#/components/trading/metric-card";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import {
  getExecutionModeBadgeVariant,
  getExecutionModeLabel,
} from "#/lib/trading/execution-mode-labels";
import { getPlatformLabel } from "#/lib/trading/platform-utils";
import {
  $remapTeacherFollowRelation,
  $unfollowTeacherTrader,
  $updateTeacherSettings,
} from "#/lib/trading/repository";
import type {
  FollowOrderRelation,
  PositionSnapshot,
  RuntimeEvent,
  TeacherPositionHistoryEntry,
  TeacherRecord,
  TraceTraderSetting,
  TraderRecord,
} from "#/lib/trading/types";

export function AccountDetailHeader(props: { account: TeacherRecord }) {
  const { t } = useI18n();
  const executionMode = props.account.executionMode ?? "dry-run";
  const hasApi = Boolean(props.account.credentials?.apiKey);

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">{props.account.name}</h2>
            <Badge variant="outline">{getPlatformLabel(props.account.platform)}</Badge>
            <Badge variant={getExecutionModeBadgeVariant(executionMode)}>
              {getExecutionModeLabel(executionMode, t)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("accounts.equity")} {props.account.equity.toFixed(2)} U ·{" "}
            {hasApi ? t("accounts.apiConnected") : t("accounts.apiMissing")}
          </p>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-3">
          <MetricCard label={t("accounts.equity")} value={`${props.account.equity.toFixed(2)} U`} />
          <MetricCard
            label={t("accounts.positionSummary", { count: props.account.teacherPositions.length })}
            value={String(props.account.teacherPositions.length)}
          />
          <MetricCard
            label={t("accounts.followSummary", {
              count: props.account.traceTraderList.filter(
                (item) => item.followStatus === "following",
              ).length,
            })}
            value={String(props.account.traceTraderList.length)}
          />
          <MetricCard
            label={t("accounts.riskCurrent")}
            value={`${(props.account.nowRiskRatio * 100).toFixed(2)}%`}
          />
        </div>
      </div>
    </div>
  );
}

export function AccountOverviewPanel(props: {
  account: TeacherRecord;
  traders: TraderRecord[];
  events: RuntimeEvent[];
  onManageFollows?: () => void;
}) {
  const { t } = useI18n();
  const activeSettings = props.account.traceTraderList.filter(
    (item) => item.followStatus === "following",
  );

  return (
    <div className="space-y-6">
      <AccountEquityChart history={props.account.equityHistory} />

      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{t("accounts.overview.activeFollows")}</h3>
          {props.onManageFollows ? (
            <Button size="sm" variant="outline" onClick={props.onManageFollows}>
              {t("accounts.overview.manageFollows")}
            </Button>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {activeSettings.length > 0 ? (
            activeSettings.map((setting) => {
              const trader = props.traders.find((item) => item.id === setting.id);
              return (
                <div key={setting.id} className="rounded-xl border bg-background p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{setting.name}</div>
                    <Badge variant="secondary">{t("accounts.followStatus.following")}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {trader?.strategyName ?? setting.id} ·{" "}
                    {setting.traceOrderMode === "fixed"
                      ? t("accounts.orderMode.fixed")
                      : t("accounts.orderMode.ratio")}{" "}
                    · +{setting.followProfit.toFixed(2)} U
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              <p>{t("accounts.overview.noFollows")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link to="/app/traders" />}
                  nativeButton={false}
                >
                  {t("accounts.overview.openTraders")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link to="/app/discover" />}
                  nativeButton={false}
                >
                  {t("accounts.overview.openDiscover")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">{t("accounts.overview.recentActivity")}</h3>
        <div className="mt-4 space-y-3">
          {props.events.slice(0, 5).length > 0 ? (
            props.events
              .slice(0, 5)
              .map((event) => <AccountEventRow key={event.id} event={event} />)
          ) : (
            <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              {t("accounts.overview.noActivity")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AccountFollowPanel(props: {
  account: TeacherRecord;
  traders: TraderRecord[];
  preferredTraderId?: string;
  onSubmitted?: () => Promise<void> | void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">{t("accounts.follow.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("accounts.follow.description")}</p>
        <div className="mt-4">
          <AccountFollowSettingsForm
            account={props.account}
            traders={props.traders}
            preferredTraderId={props.preferredTraderId}
            onSubmitted={props.onSubmitted}
          />
        </div>
        <div className="mt-4 space-y-3">
          {props.account.traceTraderList.map((setting) => (
            <TraceSettingCard
              key={setting.id}
              setting={setting}
              account={props.account}
              trader={props.traders.find((item) => item.id === setting.id)}
              onSubmitted={props.onSubmitted}
            />
          ))}
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border bg-background px-4 py-2 text-sm font-medium">
          {t("accounts.follow.advanced")}
          <ChevronDownIcon className="size-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("accounts.follow.advancedDescription")}
          </p>
          <EditFollowRelationsForm account={props.account} onSubmitted={props.onSubmitted} />
          {props.account.followRelations.map((relation) => (
            <FollowRelationCard
              key={relation.orderId}
              account={props.account}
              relation={relation}
              traders={props.traders}
              onSubmitted={props.onSubmitted}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function AccountPositionsPanel(props: { account: TeacherRecord; traders: TraderRecord[] }) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <PanelSection
          title={t("accounts.positions.account")}
          count={props.account.teacherPositions.length}
        >
          <PositionSnapshotTable positions={props.account.teacherPositions} />
        </PanelSection>
        <PanelSection title={t("accounts.positions.mapped")} count={props.account.positions.length}>
          <AccountFollowPositionsTable
            positions={props.account.positions}
            relations={props.account.followRelations}
            traders={props.traders}
          />
        </PanelSection>
      </div>
      <PanelSection
        title={t("accounts.positions.history")}
        count={props.account.positionHistory.length}
      >
        <AccountPositionHistoryTable
          entries={props.account.positionHistory}
          traders={props.traders}
        />
      </PanelSection>
    </div>
  );
}

export function AccountSettingsPanel(props: {
  account: TeacherRecord;
  onSubmitted?: () => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">{t("accounts.settings.risk")}</h3>
        <div className="mt-4">
          <AccountRiskSettingsForm account={props.account} onSubmitted={props.onSubmitted} />
        </div>
      </div>

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <h3 className="text-sm font-semibold text-destructive">{t("accounts.settings.danger")}</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={
              <Link to="/app/accounts/$accountId/logs" params={{ accountId: props.account.id }} />
            }
            nativeButton={false}
          >
            {t("accounts.settings.viewLogs")}
          </Button>
          {props.onRemove ? (
            <Button size="sm" variant="destructive" onClick={() => void props.onRemove?.()}>
              {t("accounts.settings.removeAccount")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PanelSection(props: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <span className="text-xs text-muted-foreground">{props.count}</span>
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function AccountEventRow(props: { event: RuntimeEvent }) {
  return (
    <div className="rounded-xl border bg-background p-4 text-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline">{props.event.scope}</Badge>
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

function PositionSnapshotTable(props: { positions: PositionSnapshot[] }) {
  const { t } = useI18n();
  if (props.positions.length === 0) {
    return <EmptyTable message={t("accounts.table.empty")} />;
  }

  return (
    <DataTable
      headers={[
        t("accounts.table.symbol"),
        t("accounts.table.side"),
        t("accounts.table.entry"),
        t("accounts.table.amount"),
        t("accounts.table.pnl"),
      ]}
      rows={props.positions.map((position) => [
        position.symbol,
        position.positionSide === "long" ? t("accounts.side.long") : t("accounts.side.short"),
        position.entryPrice.toFixed(2),
        position.amount.toFixed(3),
        (position.pnl ?? 0).toFixed(2),
      ])}
    />
  );
}

function AccountFollowPositionsTable(props: {
  positions: PositionSnapshot[];
  relations: FollowOrderRelation[];
  traders: TraderRecord[];
}) {
  const { t } = useI18n();
  if (props.positions.length === 0) {
    return <EmptyTable message={t("accounts.table.empty")} />;
  }

  return (
    <DataTable
      headers={[
        t("accounts.table.symbol"),
        t("accounts.table.side"),
        t("accounts.table.amount"),
        t("accounts.table.traderOrder"),
        t("accounts.table.strategy"),
      ]}
      rows={props.positions.map((position) => {
        const relation = props.relations.find((item) => item.orderId === position.id);
        const trader = relation
          ? props.traders.find((item) => item.id === relation.followTraderId)
          : null;
        return [
          position.symbol,
          position.positionSide,
          position.amount.toFixed(3),
          relation?.followOrderId ?? "—",
          trader?.strategyName ?? relation?.followTraderId ?? "—",
        ];
      })}
    />
  );
}

function AccountPositionHistoryTable(props: {
  entries: TeacherPositionHistoryEntry[];
  traders: TraderRecord[];
}) {
  const { t } = useI18n();
  const rows = [...props.entries].reverse().slice(0, 50);
  if (rows.length === 0) {
    return <EmptyTable message={t("accounts.table.empty")} />;
  }

  return (
    <DataTable
      headers={[
        t("accounts.table.symbol"),
        t("accounts.table.side"),
        t("accounts.table.profit"),
        t("accounts.table.strategy"),
        t("accounts.table.time"),
      ]}
      rows={rows.map((entry) => {
        const trader = props.traders.find((item) => item.id === entry.traderId);
        return [
          entry.symbol,
          entry.side,
          entry.profit.toFixed(2),
          trader?.strategyName ?? entry.traderId,
          new Date(entry.t).toLocaleString(),
        ];
      })}
    />
  );
}

function DataTable(props: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            {props.headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index} className="border-b last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTable(props: { message: string }) {
  return (
    <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
      {props.message}
    </div>
  );
}

function FollowRelationCard(props: {
  account: TeacherRecord;
  relation: FollowOrderRelation;
  traders: TraderRecord[];
  onSubmitted?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
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
            {props.relation.symbol} · {props.relation.positionSide}
          </div>
          <div className="text-muted-foreground">
            {props.relation.orderId} · {props.relation.followOrderId}
          </div>
        </div>
        <div className="text-right font-medium">{props.relation.unrealizedProfit.toFixed(2)} U</div>
      </div>
      <div className="mt-2 text-muted-foreground">
        {trader?.strategyName ?? props.relation.followTraderId}
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
          {editing ? t("accounts.remap.cancel") : t("accounts.remap.action")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await $remapTeacherFollowRelation({
                data: {
                  teacherId: props.account.id,
                  orderId: props.relation.orderId,
                  nextFollowOrderId: null,
                },
              });
              await props.onSubmitted?.();
            } catch (submissionError) {
              setError(
                submissionError instanceof Error ? submissionError.message : t("common.empty"),
              );
            } finally {
              setPending(false);
            }
          }}
        >
          {t("accounts.remap.clear")}
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
                  teacherId: props.account.id,
                  orderId: props.relation.orderId,
                  nextFollowOrderId,
                },
              });
              setEditing(false);
              await props.onSubmitted?.();
            } catch (submissionError) {
              setError(
                submissionError instanceof Error ? submissionError.message : t("common.empty"),
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`remap-${props.relation.orderId}`}>{t("accounts.remap.orderId")}</Label>
            <Input
              id={`remap-${props.relation.orderId}`}
              value={nextFollowOrderId}
              onChange={(event) => setNextFollowOrderId(event.target.value)}
            />
          </div>
          {error ? <div className="text-xs text-destructive">{error}</div> : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="xs"
              variant="outline"
              disabled={pending || !nextFollowOrderId}
            >
              {t("accounts.remap.save")}
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
  account: TeacherRecord;
  trader?: TraderRecord;
  onSubmitted?: () => void;
}) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border bg-background p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">{props.setting.name}</div>
            <div className="mt-1 text-muted-foreground">
              {props.trader?.strategyName ?? props.setting.id}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={props.setting.followStatus === "following" ? "secondary" : "outline"}>
              {props.setting.followStatus === "following"
                ? t("accounts.followStatus.following")
                : t("accounts.followStatus.paused")}
            </Badge>
            <Button size="xs" variant="outline" onClick={() => setSheetOpen(true)}>
              {t("accounts.follow.edit")}
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={async () => {
                await $unfollowTeacherTrader({
                  data: {
                    teacherId: props.account.id,
                    traderId: props.setting.id,
                  },
                });
                props.onSubmitted?.();
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-muted-foreground md:grid-cols-4">
          <div>
            {props.setting.traceOrderMode === "fixed"
              ? t("accounts.orderMode.fixed")
              : t("accounts.orderMode.ratio")}
          </div>
          <div>{props.setting.tracePerRatio.toFixed(3)}</div>
          <div>{props.setting.stopLossUsdt.toFixed(2)} U</div>
          <div>+{props.setting.followProfit.toFixed(2)} U</div>
        </div>
      </div>
      <CopyTargetSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        account={props.account}
        setting={props.setting}
        trader={props.trader}
        onSubmitted={props.onSubmitted}
      />
    </>
  );
}

function AccountRiskSettingsForm(props: { account: TeacherRecord; onSubmitted?: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    accountMaxRiskRate: String(props.account.settings.accountMaxRiskRate),
    safeMarginRate: String(props.account.settings.safeMarginRate),
    limitRiskRatio: String(props.account.settings.limitRiskRatio),
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await $updateTeacherSettings({
            data: {
              teacherId: props.account.id,
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
        label={t("accounts.risk.accountMax")}
        value={form.accountMaxRiskRate}
        onChange={(value) => setForm((current) => ({ ...current, accountMaxRiskRate: value }))}
      />
      <NumericField
        label={t("accounts.risk.safeMargin")}
        value={form.safeMarginRate}
        onChange={(value) => setForm((current) => ({ ...current, safeMarginRate: value }))}
      />
      <NumericField
        label={t("accounts.risk.limitRatio")}
        value={form.limitRiskRatio}
        onChange={(value) => setForm((current) => ({ ...current, limitRiskRatio: value }))}
      />
      <div className="flex justify-end md:col-span-3">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function NumericField(props: { label: string; value: string; onChange: (value: string) => void }) {
  const fieldId = props.label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{props.label}</Label>
      <Input
        id={fieldId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
