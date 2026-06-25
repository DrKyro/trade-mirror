import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import { $addTrader } from "#/lib/trading/repository";

export function AddTraderForm(props: { onSubmitted?: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    id: "",
    name: "",
    platform: "okx",
    link: "",
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await $addTrader({
            data: {
              id: form.id,
              name: form.name,
              platform: form.platform as "okx",
              link: form.link,
            },
          });
          setForm({
            id: "",
            name: "",
            platform: "okx",
            link: "",
          });
          props.onSubmitted?.();
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="text-sm text-muted-foreground md:col-span-2">{t("form.addTraderHint")}</div>
      <Field
        label={t("form.traderId")}
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
        label={t("common.link")}
        value={form.link}
        onChange={(value) => setForm((current) => ({ ...current, link: value }))}
        placeholder={t("common.optional")}
      />
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.adding") : t("form.addTrader")}
        </Button>
      </div>
    </form>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const fieldId = props.label.toLowerCase().replaceAll(" ", "-");

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{props.label}</Label>
      <Input
        id={fieldId}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
