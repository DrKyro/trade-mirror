import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold tracking-tight">{t("about.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("about.description")}</p>
      <Button render={<Link to="/" />} nativeButton={false}>
        {t("common.home")}
      </Button>
    </div>
  );
}
