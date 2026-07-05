import { useEffect, useState } from "react";

import { CopyTargetForm } from "#/components/trading/copy-target-form";
import { Button } from "#/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { useI18n } from "#/lib/i18n";
import {
  buildDefaultCopyTargetFormValues,
  formValuesToTraceSetting,
} from "#/lib/trading/copy-target-utils";
import { $updateTeacherTraceTraders } from "#/lib/trading/repository";
import type { TeacherRecord, TraceTraderSetting, TraderRecord } from "#/lib/trading/types";

export function CopyTargetSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: TeacherRecord;
  setting: TraceTraderSetting;
  trader?: TraderRecord;
  onSubmitted?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState(() =>
    buildDefaultCopyTargetFormValues(props.setting, props.trader),
  );

  useEffect(() => {
    if (props.open) {
      setForm(buildDefaultCopyTargetFormValues(props.setting, props.trader));
    }
  }, [props.open, props.setting, props.trader]);

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.setting.name}</SheetTitle>
          <SheetDescription>{props.trader?.strategyName ?? props.setting.id}</SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-4">
          <CopyTargetForm
            idPrefix={`copy-${props.account.id}-${props.setting.id}`}
            values={form}
            onChange={setForm}
            trader={props.trader}
            disabled={pending}
          />
        </div>

        <SheetFooter>
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                const nextSetting = formValuesToTraceSetting(props.setting, form);
                const nextTraceTraderList = props.account.traceTraderList.map((item) =>
                  item.id === props.setting.id ? nextSetting : item,
                );
                await $updateTeacherTraceTraders({
                  data: {
                    teacherId: props.account.id,
                    traceTraderList: nextTraceTraderList,
                  },
                });
                props.onOpenChange(false);
                await props.onSubmitted?.();
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? t("common.saving") : t("form.saveStrategySettings")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
