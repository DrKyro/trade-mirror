import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import { $addTeacher } from "#/lib/trading/repository";

export function AddTeacherForm(props: { onSubmitted?: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    id: "",
    name: "",
    platform: "bitget",
    executionMode: "dry-run",
    apiKey: "",
    apiSecret: "",
    apiPassword: "",
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await $addTeacher({
            data: {
              id: form.id,
              name: form.name,
              platform: form.platform as "bitget",
              executionMode: form.executionMode as "dry-run",
              credentials:
                form.apiKey && form.apiSecret
                  ? {
                      apiKey: form.apiKey,
                      apiSecret: form.apiSecret,
                      apiPassword: form.apiPassword || undefined,
                    }
                  : undefined,
            },
          });
          setForm({
            id: "",
            name: "",
            platform: "bitget",
            executionMode: "dry-run",
            apiKey: "",
            apiSecret: "",
            apiPassword: "",
          });
          props.onSubmitted?.();
        } finally {
          setPending(false);
        }
      }}
    >
      <Field
        label={t("form.teacherId")}
        value={form.id}
        onChange={(value) => setForm((current) => ({ ...current, id: value }))}
      />
      <Field
        label={t("common.name")}
        value={form.name}
        onChange={(value) => setForm((current) => ({ ...current, name: value }))}
      />
      <Field
        label={t("common.platform")}
        value={form.platform}
        onChange={(value) => setForm((current) => ({ ...current, platform: value }))}
      />
      <Field
        label={t("form.executionMode")}
        value={form.executionMode}
        onChange={(value) => setForm((current) => ({ ...current, executionMode: value }))}
      />
      <Field
        label={t("form.apiKey")}
        value={form.apiKey}
        onChange={(value) => setForm((current) => ({ ...current, apiKey: value }))}
      />
      <Field
        label={t("form.apiSecret")}
        value={form.apiSecret}
        onChange={(value) => setForm((current) => ({ ...current, apiSecret: value }))}
      />
      <Field
        label={t("form.apiPassword")}
        value={form.apiPassword}
        onChange={(value) => setForm((current) => ({ ...current, apiPassword: value }))}
      />
      <div className="flex justify-end md:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("form.addAccountSubmitting") : t("form.addAccount")}
        </Button>
      </div>
    </form>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }) {
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
