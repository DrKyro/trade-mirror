import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { LanguageToggle } from "#/components/language-toggle";
import { SignOutButton } from "#/components/sign-out-button";
import { Button } from "#/components/ui/button";
import { authQueryOptions } from "#/lib/auth/queries";
import { isAdminUser } from "#/lib/auth/roles";
import { useI18n } from "#/lib/i18n";

export const Route = createFileRoute("/_auth/app")({
  component: AppLayout,
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    });

    return { user };
  },
});

function AppLayout() {
  const { user } = Route.useLoaderData();
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <Link to="/app" className="text-lg font-semibold tracking-tight">
              {t("app.name")}
            </Link>
            <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button
              variant="ghost"
              size="sm"
              render={<Link to="/app/strategies" />}
              nativeButton={false}
            >
              {t("nav.strategies")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<Link to="/app/strategy-board" />}
              nativeButton={false}
            >
              {t("nav.strategyBoard")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<Link to="/app/messages" />}
              nativeButton={false}
            >
              {t("nav.messages")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<Link to="/app/teachers" />}
              nativeButton={false}
            >
              {t("nav.teachers")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<Link to="/app/system" />}
              nativeButton={false}
            >
              {t("nav.system")}
            </Button>
            {isAdminUser(user) ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link to="/app/users" />}
                  nativeButton={false}
                >
                  {t("nav.users")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link to="/app/logs" />}
                  nativeButton={false}
                >
                  {t("nav.logs")}
                </Button>
              </>
            ) : null}
            <div className="hidden text-right text-xs text-muted-foreground sm:block">
              <div>{user?.name ?? user?.email}</div>
              <div>{user?.email}</div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
