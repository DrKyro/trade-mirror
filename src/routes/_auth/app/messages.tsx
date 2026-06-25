import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useI18n } from "#/lib/i18n";
import {
  $updateLegacyUserAccountSetting,
  legacyChainInfosQueryOptions,
  legacyCountsQueryOptions,
  legacyMessagesQueryOptions,
  legacyUserAccountSettingQueryOptions,
} from "#/lib/messages/queries";
import type { LegacyChainInfoRecord, LegacyMessageRecord } from "#/lib/messages/types";

export const Route = createFileRoute("/_auth/app/messages")({
  loader: async ({ context }) => {
    const [counts, messages, chainInfos, accountSetting] = await Promise.all([
      context.queryClient.ensureQueryData(legacyCountsQueryOptions()),
      context.queryClient.ensureQueryData(legacyMessagesQueryOptions()),
      context.queryClient.ensureQueryData(legacyChainInfosQueryOptions()),
      context.queryClient.ensureQueryData(legacyUserAccountSettingQueryOptions()),
    ]);

    return { counts, messages, chainInfos, accountSetting };
  },
  component: MessagesPage,
});

function MessagesPage() {
  const { counts, messages, chainInfos, accountSetting } = Route.useLoaderData();
  const { t } = useI18n();
  const [tab, setTab] = useState<"messages" | "chain" | "account">("messages");
  const [accountForm, setAccountForm] = useState({
    binanceApiKey: accountSetting?.binanceApiKey ?? "",
    binanceSecretKey: accountSetting?.binanceSecretKey ?? "",
  });
  const messageItems = messages as LegacyMessageRecord[];
  const chainItems = chainInfos as LegacyChainInfoRecord[];

  return (
    <TradingPageShell title={t("messages.title")} description={t("messages.description")}>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={t("messages.count")} value={String(counts.messageCount)} />
        <StatCard label={t("messages.chainCount")} value={String(counts.chainCount)} />
        <StatCard
          label={t("messages.binanceKey")}
          value={accountSetting?.binanceApiKey ? t("messages.accountSaved") : t("common.empty")}
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant={tab === "messages" ? "default" : "outline"}
          onClick={() => setTab("messages")}
        >
          {t("messages.tab.messages")}
        </Button>
        <Button variant={tab === "chain" ? "default" : "outline"} onClick={() => setTab("chain")}>
          {t("messages.tab.chain")}
        </Button>
        <Button
          variant={tab === "account" ? "default" : "outline"}
          onClick={() => setTab("account")}
        >
          {t("messages.tab.account")}
        </Button>
      </div>

      {tab === "messages" ? (
        <div className="grid gap-3">
          {messageItems.map((item) => (
            <article key={item.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {item.msgData.msgAvatar ? (
                  <img
                    src={item.msgData.msgAvatar}
                    alt=""
                    className="size-12 rounded-full object-cover"
                  />
                ) : null}
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold">{item.msgData.msgTitle || item.msgSource}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.msgData.msgReleaseTime} ·{" "}
                    {new Date(item.msgData.msgCollectionTime).toLocaleString()}
                  </div>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: item.msgData.msgContent }}
                  />
                  {item.msgData.msgContentTranslate ? (
                    <div className="text-xs text-muted-foreground">
                      {t("messages.translation")}: {item.msgData.msgContentTranslate}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "chain" ? (
        <div className="grid gap-3">
          {chainItems.map((item) => (
            <article key={item.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <pre className="overflow-auto text-xs leading-5">
                {JSON.stringify(item.data, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "account" ? (
        <article className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("messages.binanceKey")} value={accountSetting?.binanceApiKey ?? ""} />
            <Field label="Binance Secret Key" value={accountSetting?.binanceSecretKey ?? ""} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              placeholder={t("messages.binanceKey")}
              value={accountForm.binanceApiKey}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, binanceApiKey: event.target.value }))
              }
            />
            <Input
              type="password"
              placeholder="Binance Secret Key"
              value={accountForm.binanceSecretKey}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, binanceSecretKey: event.target.value }))
              }
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={async () => {
                await $updateLegacyUserAccountSetting({
                  data: accountForm,
                });
              }}
            >
              {t("messages.saveAccount")}
            </Button>
          </div>
        </article>
      ) : null}
    </TradingPageShell>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

function Field(props: { label: string; value: string }) {
  const { t } = useI18n();

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="rounded-xl border bg-background px-3 py-2 text-sm">
        {props.value || t("common.empty")}
      </div>
    </div>
  );
}
