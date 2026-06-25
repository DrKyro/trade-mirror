import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import { $updateTeacherTraceTraders } from "#/lib/trading/repository";
import type { TeacherRecord, TraceTraderSetting, TraderRecord } from "#/lib/trading/types";

const DEFAULT_SETTINGS = {
  funds: 0,
  traceOrderMode: "ratio" as const,
  fixedFunds: 0,
  tracePerRatio: 0.1,
  stopLossUsdt: 0,
  stopLossPositionValueRate: 0.05,
  followStatus: "following" as const,
  unrealizedProfitSum: 0,
  followProfit: 0,
};

export function TeacherFollowSettingsForm(props: {
  teacher: TeacherRecord;
  traders: TraderRecord[];
  onSubmitted?: () => void;
}) {
  const { t } = useI18n();
  const [selectedTraderId, setSelectedTraderId] = useState(
    props.traders.find(
      (trader) => !props.teacher.traceTraderList.some((item) => item.id === trader.id),
    )?.id ?? "",
  );
  const [pending, setPending] = useState(false);

  const availableTraders = props.traders.filter(
    (trader) => !props.teacher.traceTraderList.some((item) => item.id === trader.id),
  );

  return (
    <form
      className="rounded-2xl border bg-muted/20 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selectedTraderId) {
          return;
        }

        const trader = props.traders.find((item) => item.id === selectedTraderId);
        if (!trader) {
          return;
        }

        const nextTraceTraderList: TraceTraderSetting[] = [
          ...props.teacher.traceTraderList,
          {
            id: trader.id,
            name: trader.name,
            ...DEFAULT_SETTINGS,
          },
        ];

        setPending(true);
        try {
          await $updateTeacherTraceTraders({
            data: {
              teacherId: props.teacher.id,
              traceTraderList: nextTraceTraderList,
            },
          });
          setSelectedTraderId(availableTraders.find((item) => item.id !== trader.id)?.id ?? "");
          props.onSubmitted?.();
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor={`follow-trader-${props.teacher.id}`}>
            {t("form.addStrategyToFollow")}
          </Label>
          <select
            id={`follow-trader-${props.teacher.id}`}
            className="h-8 rounded-2xl border bg-background px-3 text-sm"
            value={selectedTraderId}
            onChange={(event) => setSelectedTraderId(event.target.value)}
            disabled={availableTraders.length === 0 || pending}
          >
            <option value="">
              {availableTraders.length === 0
                ? t("form.allTradersConfigured")
                : t("form.selectTrader")}
            </option>
            {availableTraders.map((trader) => (
              <option key={trader.id} value={trader.id}>
                {trader.name} · {trader.platform}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={!selectedTraderId || pending}>
          {pending ? t("common.saving") : t("form.followTrader")}
        </Button>
      </div>
    </form>
  );
}

export function TraceTraderEditor(props: {
  teacher: TeacherRecord;
  setting: TraceTraderSetting;
  onSubmitted?: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    funds: String(props.setting.funds),
    traceOrderMode: props.setting.traceOrderMode,
    fixedFunds: String(props.setting.fixedFunds),
    tracePerRatio: String(props.setting.tracePerRatio),
    stopLossUsdt: String(props.setting.stopLossUsdt),
    stopLossPositionValueRate: String(props.setting.stopLossPositionValueRate),
    followStatus: props.setting.followStatus,
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border bg-background p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const nextTraceTraderList = props.teacher.traceTraderList.map((item) =>
          item.id === props.setting.id
            ? {
                ...item,
                funds: Number(form.funds),
                traceOrderMode: form.traceOrderMode,
                fixedFunds: Number(form.fixedFunds),
                tracePerRatio: Number(form.tracePerRatio),
                stopLossUsdt: Number(form.stopLossUsdt),
                stopLossPositionValueRate: Number(form.stopLossPositionValueRate),
                followStatus: form.followStatus,
              }
            : item,
        );

        setPending(true);
        try {
          await $updateTeacherTraceTraders({
            data: {
              teacherId: props.teacher.id,
              traceTraderList: nextTraceTraderList,
            },
          });
          props.onSubmitted?.();
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <EditorField
          label={t("form.funds")}
          value={form.funds}
          onChange={(value) => setForm((current) => ({ ...current, funds: value }))}
        />
        <div className="grid gap-2">
          <Label htmlFor={`trace-mode-${props.teacher.id}-${props.setting.id}`}>
            {t("form.orderMode")}
          </Label>
          <select
            id={`trace-mode-${props.teacher.id}-${props.setting.id}`}
            className="h-8 rounded-2xl border bg-background px-3 text-sm"
            value={form.traceOrderMode}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                traceOrderMode: event.target.value as TraceTraderSetting["traceOrderMode"],
              }))
            }
          >
            <option value="ratio">{t("form.modeRatio")}</option>
            <option value="fixed">{t("form.modeFixed")}</option>
          </select>
        </div>
        <EditorField
          label={t("form.fixedFunds")}
          value={form.fixedFunds}
          onChange={(value) => setForm((current) => ({ ...current, fixedFunds: value }))}
        />
        <EditorField
          label={t("form.traceRatio")}
          value={form.tracePerRatio}
          onChange={(value) => setForm((current) => ({ ...current, tracePerRatio: value }))}
        />
        <EditorField
          label={t("form.stopLossUsdt")}
          value={form.stopLossUsdt}
          onChange={(value) => setForm((current) => ({ ...current, stopLossUsdt: value }))}
        />
        <EditorField
          label={t("form.stopLossRate")}
          value={form.stopLossPositionValueRate}
          onChange={(value) =>
            setForm((current) => ({ ...current, stopLossPositionValueRate: value }))
          }
        />
        <div className="grid gap-2">
          <Label htmlFor={`follow-status-${props.teacher.id}-${props.setting.id}`}>
            {t("form.followStatus")}
          </Label>
          <select
            id={`follow-status-${props.teacher.id}-${props.setting.id}`}
            className="h-8 rounded-2xl border bg-background px-3 text-sm"
            value={form.followStatus}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                followStatus: event.target.value as TraceTraderSetting["followStatus"],
              }))
            }
          >
            <option value="following">{t("form.statusFollowing")}</option>
            <option value="unfollow">{t("form.statusUnfollow")}</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? t("common.saving") : t("form.saveStrategySettings")}
        </Button>
      </div>
    </form>
  );
}

function EditorField(props: { label: string; value: string; onChange: (value: string) => void }) {
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
