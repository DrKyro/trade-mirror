import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, type ChartConfig } from "#/components/ui/chart";
import { useI18n, type AppLocale } from "#/lib/i18n";
import { formatDurationLabel } from "#/lib/trading/backtest-analytics";
import {
  formatBacktestAxisTime,
  formatBacktestDateOnly,
  formatBacktestDateRange,
  formatBacktestDateWithWeekday,
  formatBacktestElapsedFromStart,
  formatBacktestFullDateTime,
  formatBacktestTimeOnly,
  formatBacktestWeekday,
  pickAxisTickIndices,
  resolveBacktestTimeSpan,
} from "#/lib/trading/backtest-time-format";
import { cn } from "#/lib/utils";

export type BacktestChartPoint = {
  label: string;
  value: number;
  time?: number;
  openTime?: number;
  holdingDurationMs?: number;
  category?: string;
  sequence?: number;
  granularity?: "day" | "datetime";
};

type HoverLabelMode = "time" | "trade" | "category";

type ChartRow = BacktestChartPoint & {
  axisLabel: string;
  hoverTitle: string;
  hoverSubtitle?: string;
  hoverLines: string[];
};

type ChartText = {
  tradeSequenceLabel: (sequence: string) => string;
  closeTradeLabel: (sequence: number) => string;
  openHourLabel: (hour: number) => string;
  dayDistributionLabel: string;
  openAtLabel: string;
  closeAtLabel: string;
  holdingLabel: string;
};

function buildTradeHoverLines(
  point: BacktestChartPoint,
  locale: AppLocale,
  text: ChartText,
  spanStart: number,
) {
  const lines: string[] = [];

  if (typeof point.openTime === "number") {
    lines.push(
      `${text.openAtLabel}: ${formatBacktestDateWithWeekday(point.openTime, locale)} ${formatBacktestTimeOnly(point.openTime, locale)}`,
    );
  }

  if (typeof point.time === "number") {
    lines.push(
      `${text.closeAtLabel}: ${formatBacktestDateWithWeekday(point.time, locale)} ${formatBacktestTimeOnly(point.time, locale)}`,
    );
  }

  if (typeof point.holdingDurationMs === "number") {
    lines.push(`${text.holdingLabel}: ${formatDurationLabel(point.holdingDurationMs)}`);
  }

  if (typeof point.time === "number" && spanStart > 0) {
    lines.push(formatBacktestElapsedFromStart(point.time, spanStart, locale));
  }

  return lines;
}

function buildHoverMeta(
  point: BacktestChartPoint,
  mode: HoverLabelMode,
  locale: AppLocale,
  text: ChartText,
  tradeSequenceLabel: (sequence: string) => string,
  spanStart: number,
) {
  if (mode === "trade") {
    const hoverLines = buildTradeHoverLines(point, locale, text, spanStart);
    if (typeof point.time === "number") {
      return {
        hoverTitle: tradeSequenceLabel(point.label),
        hoverSubtitle: `${formatBacktestFullDateTime(point.time, locale)} · ${formatBacktestWeekday(point.time, locale)}`,
        hoverLines,
      };
    }

    return {
      hoverTitle: tradeSequenceLabel(point.label),
      hoverSubtitle: undefined,
      hoverLines,
    };
  }

  if (mode === "time" && typeof point.time === "number") {
    const subtitleParts = [formatBacktestWeekday(point.time, locale)];
    const hoverLines: string[] = [];

    if (point.sequence) {
      subtitleParts.push(text.closeTradeLabel(point.sequence));
    }

    if (spanStart > 0) {
      hoverLines.push(formatBacktestElapsedFromStart(point.time, spanStart, locale));
    }

    if (point.granularity === "day") {
      return {
        hoverTitle: `${formatBacktestDateOnly(point.time, locale)} · ${text.dayDistributionLabel}`,
        hoverSubtitle: subtitleParts.join(" · "),
        hoverLines,
      };
    }

    return {
      hoverTitle: formatBacktestFullDateTime(point.time, locale),
      hoverSubtitle: subtitleParts.join(" · "),
      hoverLines,
    };
  }

  if (point.category) {
    return {
      hoverTitle: point.category,
      hoverSubtitle:
        typeof point.time === "number"
          ? `${formatBacktestDateWithWeekday(point.time, locale)} ${formatBacktestTimeOnly(point.time, locale)}`
          : undefined,
      hoverLines: [],
    };
  }

  return {
    hoverTitle: point.label,
    hoverSubtitle: undefined,
    hoverLines: [],
  };
}

function buildChartRows(
  points: BacktestChartPoint[],
  mode: HoverLabelMode,
  locale: AppLocale,
  text: ChartText,
  tradeSequenceLabel: (sequence: string) => string,
) {
  const { spanMs, start: spanStart } = resolveBacktestTimeSpan(points.map((point) => point.time));

  return points.map((point) => {
    const meta = buildHoverMeta(point, mode, locale, text, tradeSequenceLabel, spanStart);
    const axisLabel =
      mode === "trade"
        ? tradeSequenceLabel(point.label)
        : typeof point.time === "number"
          ? formatBacktestAxisTime(point.time, spanMs, locale)
          : (point.category ?? point.label);

    return {
      ...point,
      axisLabel,
      hoverTitle: meta.hoverTitle,
      hoverSubtitle: meta.hoverSubtitle,
      hoverLines: meta.hoverLines,
    } satisfies ChartRow;
  });
}

function formatMetricValue(value: number, asPercent = false) {
  return asPercent ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
}

function ChartEmptyState(props: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-64 items-center justify-center rounded-xl bg-muted/20 text-sm text-muted-foreground",
        props.className,
      )}
    >
      {props.message}
    </div>
  );
}

function BacktestChartTooltip(props: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: ChartRow }>;
  formatValue: (value: number) => string;
  valueLabel: string;
}) {
  if (!props.active || !props.payload?.length) return null;

  const row = props.payload[0]?.payload;
  const value = props.payload[0]?.value;
  if (!row || value == null) return null;

  return (
    <div className="grid max-w-[18rem] min-w-[13rem] gap-1 rounded-xl border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 backdrop-blur-sm dark:ring-foreground/10">
      <div className="leading-snug font-medium text-foreground">{row.hoverTitle}</div>
      {row.hoverSubtitle ? (
        <div className="text-[11px] leading-relaxed text-muted-foreground">{row.hoverSubtitle}</div>
      ) : null}
      {row.hoverLines.length > 0 ? (
        <div className="space-y-0.5 border-t border-border/50 pt-1 text-[11px] leading-relaxed text-muted-foreground">
          {row.hoverLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border/60 pt-1.5">
        <span className="text-muted-foreground">{props.valueLabel}</span>
        <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
          {props.formatValue(Number(value))}
        </span>
      </div>
    </div>
  );
}

function ChartAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  index?: number;
  visibleIndices: Set<number>;
}) {
  if (props.index == null || !props.visibleIndices.has(props.index)) {
    return null;
  }

  return (
    <text
      x={props.x}
      y={(props.y ?? 0) + 12}
      fill="var(--muted-foreground)"
      fontSize={11}
      textAnchor="middle"
    >
      {props.payload?.value}
    </text>
  );
}

function useChartText(): ChartText {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    tradeSequenceLabel: (sequence) => (isZh ? `第 ${sequence} 笔` : `Trade #${sequence}`),
    closeTradeLabel: (sequence) => (isZh ? `第 ${sequence} 笔平仓` : `Close #${sequence}`),
    openHourLabel: (hour) =>
      isZh ? `${hour.toString().padStart(2, "0")} 时` : `${hour.toString().padStart(2, "0")}:00`,
    dayDistributionLabel: isZh ? "开仓日期" : "Open date",
    openAtLabel: isZh ? "开仓" : "Open",
    closeAtLabel: isZh ? "平仓" : "Close",
    holdingLabel: isZh ? "持仓" : "Holding",
  };
}

function useChartTimeRangeCaption(points: BacktestChartPoint[]) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return useMemo(() => {
    const { start, end, spanMs } = resolveBacktestTimeSpan(points.map((point) => point.time));
    if (spanMs <= 0) return null;
    return formatBacktestDateRange(start, end, locale, isZh);
  }, [points, locale, isZh]);
}

export function BacktestLineChart(props: {
  points: BacktestChartPoint[];
  color: string;
  emptyMessage: string;
  heightClassName?: string;
  valueFormatter?: (value: number) => string;
  valueLabel: string;
  asPercent?: boolean;
  hoverLabelMode?: HoverLabelMode;
  tradeSequenceLabel?: (sequence: string) => string;
  showTimeRange?: boolean;
}) {
  const { locale } = useI18n();
  const chartText = useChartText();
  const gradientId = useId().replace(/:/g, "");
  const hoverLabelMode = props.hoverLabelMode ?? "time";
  const tradeSequenceLabel = props.tradeSequenceLabel ?? chartText.tradeSequenceLabel;
  const data = useMemo(
    () => buildChartRows(props.points, hoverLabelMode, locale, chartText, tradeSequenceLabel),
    [props.points, hoverLabelMode, locale, chartText, tradeSequenceLabel],
  );
  const axisTickIndices = useMemo(
    () => new Set(pickAxisTickIndices(data.length, 7)),
    [data.length],
  );
  const timeRangeCaption = useChartTimeRangeCaption(props.points);

  const chartConfig = {
    value: { label: props.valueLabel, color: props.color },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return <ChartEmptyState message={props.emptyMessage} className={props.heightClassName} />;
  }

  const formatValue = (value: number) =>
    props.valueFormatter ? props.valueFormatter(value) : formatMetricValue(value, props.asPercent);

  return (
    <div className="space-y-2">
      {props.showTimeRange !== false && timeRangeCaption ? (
        <div className="text-[11px] text-muted-foreground">{timeRangeCaption}</div>
      ) : null}
      <ChartContainer
        config={chartConfig}
        className={cn("aspect-auto w-full", props.heightClassName ?? "h-64")}
      >
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="axisLabel"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            tick={<ChartAxisTick visibleIndices={axisTickIndices} />}
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            cursor={{
              stroke: "var(--color-value)",
              strokeWidth: 1,
              strokeOpacity: 0.45,
            }}
            content={
              <BacktestChartTooltip formatValue={formatValue} valueLabel={props.valueLabel} />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 5,
              strokeWidth: 2,
              fill: "var(--color-value)",
              stroke: "var(--background)",
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export function BacktestBarChart(props: {
  points: BacktestChartPoint[];
  emptyMessage: string;
  heightClassName?: string;
  valueFormatter?: (value: number) => string;
  valueLabel: string;
  domainMode?: "centered" | "positive";
  hoverLabelMode?: HoverLabelMode;
  tradeSequenceLabel?: (sequence: string) => string;
  positiveColor?: string;
  negativeColor?: string;
  showTimeRange?: boolean;
}) {
  const { locale } = useI18n();
  const chartText = useChartText();
  const hoverLabelMode = props.hoverLabelMode ?? "category";
  const tradeSequenceLabel = props.tradeSequenceLabel ?? chartText.tradeSequenceLabel;
  const domainMode = props.domainMode ?? "centered";
  const positiveColor = props.positiveColor ?? "hsl(142 71% 45%)";
  const negativeColor = props.negativeColor ?? "hsl(0 84% 60%)";

  const data = useMemo(
    () => buildChartRows(props.points, hoverLabelMode, locale, chartText, tradeSequenceLabel),
    [props.points, hoverLabelMode, locale, chartText, tradeSequenceLabel],
  );
  const axisTickIndices = useMemo(
    () => new Set(pickAxisTickIndices(data.length, hoverLabelMode === "trade" ? 8 : 7)),
    [data.length, hoverLabelMode],
  );
  const timeRangeCaption = useChartTimeRangeCaption(props.points);

  const chartConfig = {
    value: { label: props.valueLabel, color: positiveColor },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return <ChartEmptyState message={props.emptyMessage} className={props.heightClassName} />;
  }

  const formatValue = (value: number) =>
    props.valueFormatter ? props.valueFormatter(value) : String(value);

  return (
    <div className="space-y-2">
      {props.showTimeRange && timeRangeCaption ? (
        <div className="text-[11px] text-muted-foreground">{timeRangeCaption}</div>
      ) : null}
      <ChartContainer
        config={chartConfig}
        className={cn("aspect-auto w-full", props.heightClassName ?? "h-64")}
      >
        <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="axisLabel"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            tick={<ChartAxisTick visibleIndices={axisTickIndices} />}
          />
          <YAxis hide domain={domainMode === "positive" ? [0, "auto"] : ["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35, strokeWidth: 1 }}
            content={
              <BacktestChartTooltip formatValue={formatValue} valueLabel={props.valueLabel} />
            }
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell
                key={`bar-${index}-${entry.label}`}
                fill={domainMode === "positive" || entry.value >= 0 ? positiveColor : negativeColor}
                fillOpacity={0.88}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function downsampleChartPoints<T extends BacktestChartPoint>(
  points: T[],
  maxPoints: number,
) {
  if (points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}
