import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import {
  deriveTraceRatioFromStopLoss,
  type CopyTargetFormValues,
} from "#/lib/trading/copy-target-utils";
import type { TraderRecord } from "#/lib/trading/types";

export function CopyTargetForm(props: {
  idPrefix: string;
  values: CopyTargetFormValues;
  onChange: (values: CopyTargetFormValues) => void;
  trader?: TraderRecord;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { values, onChange, trader, disabled } = props;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <FormField
        id={`${props.idPrefix}-funds`}
        label={t("form.funds")}
        value={values.funds}
        disabled={disabled}
        onChange={(funds) => onChange({ ...values, funds })}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${props.idPrefix}-mode`}>{t("form.orderMode")}</Label>
        <select
          id={`${props.idPrefix}-mode`}
          className="h-9 rounded-2xl border bg-background px-3 text-sm"
          value={values.traceOrderMode}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...values,
              traceOrderMode: event.target.value as CopyTargetFormValues["traceOrderMode"],
            })
          }
        >
          <option value="ratio">{t("form.modeRatio")}</option>
          <option value="fixed">{t("form.modeFixed")}</option>
        </select>
      </div>
      {values.traceOrderMode === "fixed" ? (
        <FormField
          id={`${props.idPrefix}-fixed`}
          label={t("form.fixedFunds")}
          value={values.fixedFunds}
          disabled={disabled}
          onChange={(fixedFunds) => onChange({ ...values, fixedFunds })}
        />
      ) : (
        <FormField
          id={`${props.idPrefix}-ratio`}
          label={t("form.traceRatio")}
          value={values.tracePerRatio}
          disabled={disabled}
          onChange={(tracePerRatio) => onChange({ ...values, tracePerRatio })}
        />
      )}
      <FormField
        id={`${props.idPrefix}-stop-loss`}
        label={t("form.stopLossUsdt")}
        value={values.stopLossUsdt}
        disabled={disabled}
        onChange={(stopLossUsdt) =>
          onChange({
            ...values,
            stopLossUsdt,
            tracePerRatio:
              trader && values.traceOrderMode === "ratio"
                ? deriveTraceRatioFromStopLoss(stopLossUsdt, trader)
                : values.tracePerRatio,
          })
        }
      />
      <FormField
        id={`${props.idPrefix}-stop-rate`}
        label={t("form.stopLossRate")}
        value={values.stopLossPositionValueRate}
        disabled={disabled}
        onChange={(stopLossPositionValueRate) => onChange({ ...values, stopLossPositionValueRate })}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${props.idPrefix}-status`}>{t("form.followStatus")}</Label>
        <select
          id={`${props.idPrefix}-status`}
          className="h-9 rounded-2xl border bg-background px-3 text-sm"
          value={values.followStatus}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...values,
              followStatus: event.target.value as CopyTargetFormValues["followStatus"],
            })
          }
        >
          <option value="following">{t("form.statusFollowing")}</option>
          <option value="unfollow">{t("form.statusUnfollow")}</option>
        </select>
      </div>
    </div>
  );
}

function FormField(props: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
