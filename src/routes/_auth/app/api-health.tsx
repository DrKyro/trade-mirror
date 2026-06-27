import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import type {
  ApiHealthModelSection,
  ApiHealthPlatformModel,
  ApiHealthReport,
  ApiHealthResult,
} from "#/lib/trading/api-health";
import { apiHealthQueryOptions } from "#/lib/trading/queries";

export const Route = createFileRoute("/_auth/app/api-health")({
  loader: async ({ context }) => {
    const apiHealth = await context.queryClient.ensureQueryData(apiHealthQueryOptions());
    return { apiHealth };
  },
  component: ApiHealthPage,
});

function ApiHealthPage() {
  const { apiHealth: initialData } = Route.useLoaderData();
  const routeContext = Route.useRouteContext();
  const text = useApiHealthText();
  const [data, setData] = useState<ApiHealthReport>(initialData);
  const [loading, setLoading] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const fresh = await routeContext.queryClient.fetchQuery(apiHealthQueryOptions());
      setData(fresh);
      const okCount = fresh.endpoints.filter((r) => r.status === "ok").length;
      const errCount = fresh.endpoints.filter((r) => r.status !== "ok").length;
      if (errCount > 0) {
        toast.warning(text.refreshDoneWithErrors(okCount, errCount));
      } else {
        toast.success(text.refreshDone(okCount));
      }
    } catch {
      toast.error(text.refreshFailed);
    } finally {
      setLoading(false);
    }
  };

  const platforms = useMemo(() => {
    const set = new Set(data.endpoints.map((r) => r.platform));
    return Array.from(set);
  }, [data]);

  const filtered = useMemo(() => {
    if (platformFilter === "all") return data.endpoints;
    return data.endpoints.filter((r) => r.platform === platformFilter);
  }, [data, platformFilter]);

  const filteredModels = useMemo(() => {
    if (platformFilter === "all") return data.platformModels;
    return data.platformModels.filter((model) => model.platform === platformFilter);
  }, [data, platformFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiHealthResult[]>();
    for (const result of filtered) {
      const arr = map.get(result.platform) ?? [];
      arr.push(result);
      map.set(result.platform, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const summary = useMemo(() => {
    const endpoints = data.endpoints;
    const ok = endpoints.filter((r) => r.status === "ok").length;
    const error = endpoints.filter((r) => r.status === "error").length;
    const timeout = endpoints.filter((r) => r.status === "timeout").length;
    const avgLatency =
      endpoints
        .filter((r) => r.latencyMs !== null)
        .reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) /
      (endpoints.filter((r) => r.latencyMs !== null).length || 1);
    const missingFields = data.platformModels.reduce((sum, model) => sum + model.missingCount, 0);
    return {
      ok,
      error,
      timeout,
      total: endpoints.length,
      avgLatency: Math.round(avgLatency),
      missingFields,
    };
  }, [data]);

  return (
    <TradingPageShell
      title={text.title}
      description={text.description}
      actions={
        <Button size="sm" onClick={handleRefresh} disabled={loading}>
          {loading ? text.refreshing : text.refreshNow}
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label={text.totalEndpoints} value={String(summary.total)} ok />
        <SummaryTile
          label={text.healthy}
          value={String(summary.ok)}
          ok={summary.ok === summary.total}
        />
        <SummaryTile
          label={text.errors}
          value={String(summary.error + summary.timeout)}
          ok={summary.error + summary.timeout === 0}
        />
        <SummaryTile
          label={text.avgLatency}
          value={`${summary.avgLatency}ms`}
          ok={summary.avgLatency < 2000}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label={text.modelMissing}
          value={String(summary.missingFields)}
          ok={summary.missingFields === 0}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={text.allPlatforms}
          active={platformFilter === "all"}
          onClick={() => setPlatformFilter("all")}
        />
        {platforms.map((p) => (
          <FilterChip
            key={p}
            label={p}
            active={platformFilter === p}
            onClick={() => setPlatformFilter(p)}
          />
        ))}
      </div>

      {filteredModels.map((model) => (
        <PlatformModelCard key={model.platformId} model={model} text={text} />
      ))}

      {grouped.map(([platform, results]) => (
        <div key={platform} className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{platform}</h2>
            <div className="text-sm text-muted-foreground">
              {text.platformSummary(
                results.filter((r) => r.status === "ok").length,
                results.length,
              )}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pr-4 pb-2 font-medium">{text.colStatus}</th>
                  <th className="pr-4 pb-2 font-medium">{text.colEndpoint}</th>
                  <th className="pr-4 pb-2 font-medium">{text.colMethod}</th>
                  <th className="pr-4 pb-2 text-right font-medium">{text.colLatency}</th>
                  <th className="pr-4 pb-2 text-right font-medium">{text.colDataCount}</th>
                  <th className="pr-4 pb-2 text-right font-medium">{text.colSize}</th>
                  <th className="pb-2 font-medium">{text.colError}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <StatusBadge status={result.status} text={text} />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{result.name}</div>
                      <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                        {result.url}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {result.method}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {result.latencyMs !== null ? `${result.latencyMs}ms` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {result.dataCount !== null ? String(result.dataCount) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {result.responseSizeBytes !== null
                        ? formatBytes(result.responseSizeBytes)
                        : "—"}
                    </td>
                    <td className="max-w-xs py-3">
                      {result.error ? (
                        <span className="text-xs text-destructive">{result.error}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </TradingPageShell>
  );
}

function PlatformModelCard({
  model,
  text,
}: {
  model: ApiHealthPlatformModel;
  text: ReturnType<typeof useApiHealthText>;
}) {
  const missingFields = model.sections.flatMap((section) =>
    section.fields.filter((field) => field.status !== "ready").map((field) => ({ section, field })),
  );

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{model.platform}</h2>
          <p className="text-sm text-muted-foreground">
            {text.sampleTraderId}: <span className="font-mono">{model.sampleTraderId}</span>
          </p>
        </div>
        <ModelStatusBadge status={model.overallStatus} text={text} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryTile
          label={text.modelReady}
          value={String(model.readyCount)}
          ok={model.readyCount > 0}
        />
        <SummaryTile
          label={text.modelPartial}
          value={String(model.partialCount)}
          ok={model.partialCount === 0}
        />
        <SummaryTile
          label={text.modelMissing}
          value={String(model.missingCount)}
          ok={model.missingCount === 0}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {model.sections.map((section) => (
          <ModelSectionCard key={section.id} section={section} text={text} />
        ))}
      </div>

      {missingFields.length > 0 ? (
        <div className="mt-5 rounded-xl border border-dashed p-4">
          <h3 className="text-sm font-semibold">{text.needFromPage}</h3>
          <div className="mt-3 space-y-3">
            {missingFields.map(({ section, field }) => (
              <div key={`${section.id}-${field.id}`} className="text-sm">
                <div className="font-medium">
                  {section.label} / {field.label}
                </div>
                <div className="text-muted-foreground">
                  {field.pageHint ?? field.note ?? text.noHint}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelSectionCard({
  section,
  text,
}: {
  section: ApiHealthModelSection;
  text: ReturnType<typeof useApiHealthText>;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{section.label}</h3>
        <ModelStatusBadge status={section.status} text={text} compact />
      </div>
      {section.note ? <p className="mt-2 text-xs text-muted-foreground">{section.note}</p> : null}
      <div className="mt-3 space-y-2">
        {section.fields.map((field) => (
          <div key={field.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{field.label}</div>
              <ModelStatusBadge status={field.status} text={text} compact />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {text.sourceLabel}: {field.source}
            </div>
            {field.note ? (
              <div className="mt-1 text-xs text-muted-foreground">{field.note}</div>
            ) : null}
            {field.pageHint ? (
              <div className="mt-1 text-xs text-amber-600">
                {text.pageHintLabel}: {field.pageHint}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  text,
}: {
  status: ApiHealthResult["status"];
  text: ReturnType<typeof useApiHealthText>;
}) {
  const config = {
    ok: { color: "bg-emerald-500", label: text.statusOk },
    error: { color: "bg-red-500", label: text.statusError },
    timeout: { color: "bg-amber-500", label: text.statusTimeout },
  } as const;

  const { color, label } = config[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function ModelStatusBadge({
  status,
  text,
  compact = false,
}: {
  status: "ready" | "partial" | "missing";
  text: ReturnType<typeof useApiHealthText>;
  compact?: boolean;
}) {
  const config = {
    ready: { color: "bg-emerald-500", label: text.modelReady },
    partial: { color: "bg-amber-500", label: text.modelPartial },
    missing: { color: "bg-red-500", label: text.modelMissing },
  } as const;

  const { color, label } = config[status];

  return (
    <div className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="font-medium">{label}</span>
    </div>
  );
}

function SummaryTile({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useApiHealthText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    isZh,
    title: isZh ? "接口健康状态" : "API Health Status",
    description: isZh
      ? "各平台跟单交易 API 接口的实时健康状态、延迟、返回数据量和错误信息。"
      : "Real-time health status, latency, response data count, and errors for all platform copy-trading API endpoints.",
    refreshNow: isZh ? "立即检测" : "Run Probe",
    refreshing: isZh ? "检测中..." : "Probing...",
    refreshDone: (count: number) =>
      isZh ? `检测完成，${count} 个接口正常。` : `Probe complete, ${count} endpoint(s) healthy.`,
    refreshDoneWithErrors: (ok: number, err: number) =>
      isZh ? `检测完成：${ok} 正常，${err} 异常。` : `Probe complete: ${ok} ok, ${err} issue(s).`,
    refreshFailed: isZh ? "检测失败，请重试。" : "Probe failed, please retry.",
    totalEndpoints: isZh ? "接口总数" : "Total Endpoints",
    healthy: isZh ? "健康" : "Healthy",
    errors: isZh ? "异常" : "Errors",
    avgLatency: isZh ? "平均延迟" : "Avg Latency",
    modelReady: isZh ? "已覆盖" : "Ready",
    modelPartial: isZh ? "部分覆盖" : "Partial",
    modelMissing: isZh ? "缺失字段" : "Missing",
    sampleTraderId: isZh ? "样例交易员 ID" : "Sample Trader ID",
    needFromPage: isZh ? "需要你帮我从网页确认的数据" : "Data I still need from the webpage",
    noHint: isZh ? "暂无额外提示" : "No extra hint yet",
    sourceLabel: isZh ? "来源" : "Source",
    pageHintLabel: isZh ? "网页定位" : "Page Hint",
    allPlatforms: isZh ? "全部平台" : "All Platforms",
    platformSummary: (ok: number, total: number) =>
      isZh ? `${ok}/${total} 正常` : `${ok}/${total} ok`,
    colStatus: isZh ? "状态" : "Status",
    colEndpoint: isZh ? "接口" : "Endpoint",
    colMethod: isZh ? "方法" : "Method",
    colLatency: isZh ? "延迟" : "Latency",
    colDataCount: isZh ? "数据量" : "Data Count",
    colSize: isZh ? "响应大小" : "Response Size",
    colError: isZh ? "错误信息" : "Error",
    statusOk: isZh ? "正常" : "OK",
    statusError: isZh ? "错误" : "Error",
    statusTimeout: isZh ? "超时" : "Timeout",
  };
}
