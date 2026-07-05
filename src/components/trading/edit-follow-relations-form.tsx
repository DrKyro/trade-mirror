import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { useI18n } from "#/lib/i18n";
import { $updateTeacherFollowRelations } from "#/lib/trading/repository";
import type { TeacherRecord } from "#/lib/trading/types";

export function EditFollowRelationsForm(props: {
  account: TeacherRecord;
  onSubmitted?: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(JSON.stringify(props.account.followRelations, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="rounded-2xl border bg-muted/20 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        let parsed: unknown;

        try {
          parsed = JSON.parse(value);
          setError(null);
        } catch {
          setError(t("form.followRelationInvalid"));
          return;
        }

        if (!Array.isArray(parsed)) {
          setError(t("form.followRelationArray"));
          return;
        }

        setPending(true);
        try {
          await $updateTeacherFollowRelations({
            data: {
              teacherId: props.account.id,
              followRelations: parsed as TeacherRecord["followRelations"],
            },
          });
          props.onSubmitted?.();
        } catch (submissionError) {
          setError(
            submissionError instanceof Error
              ? submissionError.message
              : t("form.followRelationSaveFailed"),
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`follow-relations-${props.account.id}`}>
          {t("form.followRelationEditor")}
        </Label>
        <textarea
          id={`follow-relations-${props.account.id}`}
          className="min-h-64 rounded-2xl border bg-background p-3 font-mono text-sm"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? t("common.saving") : t("form.updateRelations")}
        </Button>
      </div>
    </form>
  );
}
