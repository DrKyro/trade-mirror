import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import { accountLogContentQueryOptions, accountLogsQueryOptions } from "#/lib/system/log-queries";

export const Route = createFileRoute("/_auth/app/accounts/$accountId/logs")({
  loader: async ({ context, params }) => {
    const logs = await context.queryClient.ensureQueryData(
      accountLogsQueryOptions(params.accountId),
    );
    const initialLog = logs[0] ?? null;
    const initialContent = initialLog
      ? await context.queryClient.ensureQueryData(
          accountLogContentQueryOptions(
            params.accountId,
            initialLog.sourceKey,
            initialLog.relativePath,
          ),
        )
      : null;

    return {
      accountId: params.accountId,
      logs,
      initialLog,
      initialContent,
    };
  },
  component: AccountLogsPage,
});

function AccountLogsPage() {
  const { accountId, logs, initialLog, initialContent } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedLogPath, setSelectedLogPath] = useState(
    initialLog ? `${initialLog.sourceKey}:${initialLog.relativePath}` : "",
  );
  const [content, setContent] = useState(initialContent?.content ?? "");

  const selectedLog =
    logs.find((entry) => `${entry.sourceKey}:${entry.relativePath}` === selectedLogPath) ??
    initialLog;

  return (
    <TradingPageShell
      title={`${accountId} / ${t("logs.title")}`}
      description={t("accountLogs.description", { accountId })}
    >
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/app/accounts/$accountId" params={{ accountId }} />}
          nativeButton={false}
        >
          {t("accounts.detail.back")}
        </Button>
        <div className="text-sm text-muted-foreground">
          {t("accountLogs.fileCount", { accountId, count: logs.length })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm text-muted-foreground">{t("logs.title")}</div>
          <div className="max-h-[70vh] overflow-auto">
            {logs.length > 0 ? (
              logs.map((entry) => {
                const value = `${entry.sourceKey}:${entry.relativePath}`;
                const active = value === selectedLogPath;

                return (
                  <button
                    key={value}
                    type="button"
                    className={`flex w-full flex-col items-start gap-1 border-b px-4 py-3 text-left text-sm hover:bg-muted/40 ${
                      active ? "bg-muted/50" : ""
                    }`}
                    onClick={async () => {
                      setSelectedLogPath(value);
                      const next = await queryClient.ensureQueryData(
                        accountLogContentQueryOptions(
                          accountId,
                          entry.sourceKey,
                          entry.relativePath,
                        ),
                      );
                      setContent(next.content);
                    }}
                  >
                    <div className="font-medium">{entry.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.sourceLabel} · {entry.relativePath}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.updatedAt).toLocaleString()} · {formatBytes(entry.size)}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-sm text-muted-foreground">{t("accountLogs.noLogs")}</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm text-muted-foreground">
            {selectedLog
              ? `${selectedLog.sourceLabel} / ${selectedLog.relativePath}`
              : t("logs.noSelected")}
          </div>
          <pre className="max-h-[70vh] overflow-auto p-4 text-xs leading-6 break-words whitespace-pre-wrap">
            {content || t("logs.noContent")}
          </pre>
        </div>
      </div>
    </TradingPageShell>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
