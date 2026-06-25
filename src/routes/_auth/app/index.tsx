import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";

export const Route = createFileRoute("/_auth/app/")({
  component: AppDashboardPage,
});

function AppDashboardPage() {
  const { t } = useI18n();

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-4">
          <div className="text-sm font-medium text-primary">{t("dashboard.badge")}</div>
          <h1 className="text-4xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("dashboard.description")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button render={<Link to="/app/strategies" />} nativeButton={false}>
              {t("dashboard.openStrategies")}
            </Button>
            <Button
              variant="outline"
              render={<Link to="/app/strategy-board" />}
              nativeButton={false}
            >
              {t("dashboard.openStrategyBoard")}
            </Button>
            <Button variant="outline" render={<Link to="/app/messages" />} nativeButton={false}>
              {t("dashboard.openMessages")}
            </Button>
            <Button variant="outline" render={<Link to="/app/teachers" />} nativeButton={false}>
              {t("dashboard.openTeachers")}
            </Button>
            <Button variant="outline" render={<Link to="/app/system" />} nativeButton={false}>
              {t("dashboard.openSystem")}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-muted/40 p-8 shadow-sm">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t("dashboard.targets")}</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>{t("dashboard.target1")}</li>
            <li>{t("dashboard.target2")}</li>
            <li>{t("dashboard.target3")}</li>
            <li>{t("dashboard.target4")}</li>
            <li>{t("dashboard.target5")}</li>
          </ul>
          <div className="rounded-2xl border bg-background p-4">
            <h3 className="text-sm font-semibold">{t("dashboard.guideTitle")}</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>{t("dashboard.guide1")}</li>
              <li>{t("dashboard.guide2")}</li>
              <li>{t("dashboard.guide3")}</li>
              <li>{t("dashboard.guide4")}</li>
              <li>{t("dashboard.guide5")}</li>
              <li>{t("dashboard.guide6")}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
