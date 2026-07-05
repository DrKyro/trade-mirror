import { createFileRoute, Link } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AccountCard } from "#/components/trading/account-card";
import { AddAccountDialog } from "#/components/trading/add-account-dialog";
import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import { accountsQueryOptions } from "#/lib/trading/queries";
import type { TeacherRecord } from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/accounts")({
  loader: async ({ context }) => {
    const accounts = await context.queryClient.ensureQueryData(accountsQueryOptions());
    return { accounts };
  },
  component: AccountsPage,
});

function AccountsPage() {
  const { accounts } = Route.useLoaderData();
  const router = useRouter();
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const summary = useMemo(() => buildSummary(accounts), [accounts]);

  return (
    <TradingPageShell
      title={t("accounts.pageTitle")}
      description={t("accounts.pageDescription")}
      actions={
        <Button size="sm" onClick={() => setAddOpen(true)}>
          {t("accounts.bindNew")}
        </Button>
      }
    >
      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmitted={async () => {
          await router.invalidate();
        }}
      />

      <AccountOnboardingGuide />

      {accounts.length > 0 ? (
        <>
          <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("accounts.summary", summary)}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
          <h2 className="text-lg font-semibold">{t("accounts.emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("accounts.emptyDescription")}
          </p>
          <Button className="mt-6" onClick={() => setAddOpen(true)}>
            {t("accounts.bindNew")}
          </Button>
        </div>
      )}
    </TradingPageShell>
  );
}

function AccountOnboardingGuide() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">{t("accounts.onboarding.title")}</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>{t("accounts.onboarding.step1")}</li>
        <li>{t("accounts.onboarding.step2")}</li>
        <li>{t("accounts.onboarding.step3")}</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/discover" />}
          nativeButton={false}
        >
          {t("accounts.overview.openDiscover")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/app/traders" />}
          nativeButton={false}
        >
          {t("accounts.overview.openTraders")}
        </Button>
      </div>
    </div>
  );
}

function buildSummary(accounts: TeacherRecord[]) {
  const equity = accounts.reduce((sum, account) => sum + account.equity, 0);
  const follows = accounts.reduce(
    (sum, account) =>
      sum + account.traceTraderList.filter((item) => item.followStatus === "following").length,
    0,
  );
  const positions = accounts.reduce((sum, account) => sum + account.teacherPositions.length, 0);

  return {
    count: accounts.length,
    equity: equity.toFixed(2),
    follows,
    positions,
  };
}
