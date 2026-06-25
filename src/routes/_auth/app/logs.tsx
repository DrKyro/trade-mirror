import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { TradingPageShell } from "#/components/trading/page-shell";
import { authQueryOptions } from "#/lib/auth/queries";
import { isAdminUser } from "#/lib/auth/roles";
import { useI18n } from "#/lib/i18n";
import { logContentQueryOptions, logsQueryOptions } from "#/lib/system/log-queries";

const FORBIDDEN_ERROR = "Forbidden";

export const Route = createFileRoute("/_auth/app/logs")({
  loader: async ({ context }) => {
    const currentUser = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    });
    if (!isAdminUser(currentUser)) {
      throw new Error(FORBIDDEN_ERROR);
    }

    const logs = await context.queryClient.ensureQueryData(logsQueryOptions());
    const initialLog = logs[0] ?? null;
    const initialContent = initialLog
      ? await context.queryClient.ensureQueryData(
          logContentQueryOptions(initialLog.sourceKey, initialLog.relativePath),
        )
      : null;

    return {
      logs,
      initialLog,
      initialContent,
    };
  },
  component: LogsPage,
});

function LogsPage() {
  const { logs, initialLog, initialContent } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedLogPath, setSelectedLogPath] = useState(
    initialLog ? `${initialLog.sourceKey}:${initialLog.relativePath}` : "",
  );

  const selectedLog =
    logs.find((entry) => `${entry.sourceKey}:${entry.relativePath}` === selectedLogPath) ??
    initialLog;

  const [content, setContent] = useState(initialContent?.content ?? "");
  const { locale } = useI18n();

  return (
    <TradingPageShell title={t("logs.title")} description={t("logs.description")}>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm text-muted-foreground">
            {t("logs.total", { count: logs.length })}
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {logs.map((entry) => {
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
                      logContentQueryOptions(entry.sourceKey, entry.relativePath),
                    );
                    setContent(next.content);
                  }}
                >
                  <div className="font-medium">{entry.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.sourceLabel} · {entry.relativePath}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatLogTimestamp(entry.updatedAt, locale)} · {formatBytes(entry.size)}
                  </div>
                </button>
              );
            })}
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

function formatLogTimestamp(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
