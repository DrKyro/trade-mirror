import { Link } from "@tanstack/react-router";

import { useI18n } from "#/lib/i18n";

import { Button } from "./ui/button";

export function DefaultNotFound() {
  const { t } = useI18n();

  return (
    <div className="space-y-2 p-2">
      <p>{t("common.notFound")}</p>
      <p className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => window.history.back()}>
          {t("common.goBack")}
        </Button>
        <Button render={<Link to="/" />} variant="secondary" nativeButton={false}>
          {t("common.home")}
        </Button>
      </p>
    </div>
  );
}
