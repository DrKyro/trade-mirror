import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { LanguageToggle } from "#/components/language-toggle";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-4 py-16">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="space-y-4">
        <div className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          {t("landing.badge")}
        </div>
        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight">{t("landing.title")}</h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          {t("landing.description")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" render={<Link to="/login" />} nativeButton={false}>
          {t("landing.signIn")}
        </Button>
        <Button size="lg" variant="outline" render={<Link to="/signup" />} nativeButton={false}>
          {t("landing.createAccount")}
        </Button>
      </div>
    </div>
  );
}
