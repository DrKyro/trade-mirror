import { useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { useI18n } from "#/lib/i18n";
import { EXECUTION_MODES, isExchangeBackedMode } from "#/lib/trading/execution-mode";
import {
  getExecutionModeHint,
  getExecutionModeLabel,
  getPlatformDemoApiHint,
} from "#/lib/trading/execution-mode-labels";
import { DEMO_ACCOUNT_PLATFORMS, getPlatformLabel } from "#/lib/trading/platform-utils";
import { $addTeacher, $probeTeacherAccount } from "#/lib/trading/repository";
import type { ExecutionMode, TraderPlatform } from "#/lib/trading/types";

function createAccountId() {
  return `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_PLATFORM: TraderPlatform = "okx";

export function AddAccountDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const open = props.open;
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    ok: boolean;
    balance?: number;
    equity?: number;
    positionCount?: number;
    error?: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    platform: DEFAULT_PLATFORM,
    executionMode: "demo" as ExecutionMode,
    apiKey: "",
    apiSecret: "",
    apiPassword: "",
  });

  const requiresExchangeCredentials = isExchangeBackedMode(form.executionMode);

  const reset = () => {
    setStep(0);
    setProbeResult(null);
    setForm({
      name: "",
      platform: DEFAULT_PLATFORM,
      executionMode: "demo",
      apiKey: "",
      apiSecret: "",
      apiPassword: "",
    });
  };

  const patchForm = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    if (
      "apiKey" in patch ||
      "apiSecret" in patch ||
      "apiPassword" in patch ||
      "platform" in patch ||
      "executionMode" in patch
    ) {
      setProbeResult(null);
    }
  };

  const canAdvance =
    step === 0
      ? form.name.trim().length > 0
      : step === 1
        ? requiresExchangeCredentials
          ? form.apiKey.trim().length > 0 &&
            form.apiSecret.trim().length > 0 &&
            probeResult?.ok === true
          : true
        : true;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        props.onOpenChange(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("accounts.dialog.title")}</DialogTitle>
          <DialogDescription>{t("accounts.dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 text-xs text-muted-foreground">
          <StepIndicator active={step === 0} label={t("accounts.dialog.stepPlatform")} />
          <StepIndicator active={step === 1} label={t("accounts.dialog.stepCredentials")} />
          <StepIndicator active={step === 2} label={t("accounts.dialog.stepConfirm")} />
        </div>

        {step === 0 ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="account-name">{t("accounts.dialog.accountName")}</Label>
              <Input
                id="account-name"
                value={form.name}
                placeholder={t("accounts.dialog.accountNamePlaceholder")}
                onChange={(event) => patchForm({ name: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("common.platform")}</Label>
              <Select
                value={form.platform}
                onValueChange={(value) => patchForm({ platform: value as TraderPlatform })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_ACCOUNT_PLATFORMS.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {getPlatformLabel(platform)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("accounts.dialog.demoPlatformsOnly")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>{t("form.executionMode")}</Label>
              <div className="grid gap-2">
                {EXECUTION_MODES.map((mode) => (
                  <label
                    key={mode}
                    htmlFor={`execution-mode-${mode}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${
                      form.executionMode === mode ? "border-primary bg-primary/5" : "bg-background"
                    }`}
                  >
                    <input
                      id={`execution-mode-${mode}`}
                      type="radio"
                      name="execution-mode-step0"
                      className="mt-1"
                      checked={form.executionMode === mode}
                      onChange={() => patchForm({ executionMode: mode })}
                    />
                    <span className="space-y-1">
                      <span className="block font-medium">{getExecutionModeLabel(mode, t)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {getExecutionModeHint(mode, t)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4">
            {requiresExchangeCredentials ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("accounts.dialog.credentialsHint")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {getPlatformDemoApiHint(form.platform, t)}
                </p>
                <div className="grid gap-2">
                  <Label htmlFor="account-api-key">{t("form.apiKey")}</Label>
                  <Input
                    id="account-api-key"
                    value={form.apiKey}
                    onChange={(event) => patchForm({ apiKey: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account-api-secret">{t("form.apiSecret")}</Label>
                  <Input
                    id="account-api-secret"
                    type="password"
                    value={form.apiSecret}
                    onChange={(event) => patchForm({ apiSecret: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account-api-password">
                    {t("form.apiPassword")} ({t("common.optional")})
                  </Label>
                  <Input
                    id="account-api-password"
                    type="password"
                    value={form.apiPassword}
                    onChange={(event) => patchForm({ apiPassword: event.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={probing || !form.apiKey.trim() || !form.apiSecret.trim()}
                    onClick={async () => {
                      setProbing(true);
                      setProbeResult(null);
                      try {
                        const result = await $probeTeacherAccount({
                          data: {
                            platform: form.platform,
                            executionMode: form.executionMode,
                            credentials: {
                              apiKey: form.apiKey.trim(),
                              apiSecret: form.apiSecret.trim(),
                              apiPassword: form.apiPassword.trim() || undefined,
                            },
                          },
                        });
                        setProbeResult(result);
                      } finally {
                        setProbing(false);
                      }
                    }}
                  >
                    {probing ? t("accounts.dialog.probeTesting") : t("accounts.dialog.probeTest")}
                  </Button>
                  {probeResult?.ok ? (
                    <p className="text-sm text-emerald-600">
                      {t("accounts.dialog.probeSuccess", {
                        equity: (probeResult.equity ?? probeResult.balance ?? 0).toFixed(2),
                        positions: probeResult.positionCount ?? 0,
                      })}
                    </p>
                  ) : null}
                  {probeResult && !probeResult.ok ? (
                    <p className="text-sm text-destructive">
                      {t("accounts.dialog.probeFailed", { error: probeResult.error ?? "unknown" })}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("accounts.dialog.probeRequired")}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("accounts.dialog.dryRunNoCredentials")}
              </p>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border bg-muted/20 p-4 text-sm">
              <SummaryRow label={t("accounts.dialog.accountName")} value={form.name} />
              <SummaryRow label={t("common.platform")} value={getPlatformLabel(form.platform)} />
              <SummaryRow
                label={t("form.executionMode")}
                value={getExecutionModeLabel(form.executionMode, t)}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => current - 1)}
            >
              {t("accounts.dialog.prev")}
            </Button>
          ) : null}
          {step < 2 ? (
            <Button
              type="button"
              disabled={!canAdvance}
              onClick={() => setStep((current) => current + 1)}
            >
              {t("accounts.dialog.next")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending}
              onClick={async () => {
                if (requiresExchangeCredentials && !probeResult?.ok) {
                  toast.error(t("accounts.dialog.probeRequired"));
                  return;
                }

                setPending(true);
                try {
                  await $addTeacher({
                    data: {
                      id: createAccountId(),
                      name: form.name.trim(),
                      platform: form.platform,
                      executionMode: form.executionMode,
                      credentials: requiresExchangeCredentials
                        ? {
                            apiKey: form.apiKey.trim(),
                            apiSecret: form.apiSecret.trim(),
                            apiPassword: form.apiPassword.trim() || undefined,
                          }
                        : undefined,
                    },
                  });
                  props.onOpenChange(false);
                  reset();
                  await props.onSubmitted?.();
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? t("common.adding") : t("accounts.dialog.submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator(props: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${props.active ? "bg-primary/10 text-primary" : "bg-muted"}`}
    >
      {props.label}
    </span>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-medium">{props.value}</span>
    </div>
  );
}
