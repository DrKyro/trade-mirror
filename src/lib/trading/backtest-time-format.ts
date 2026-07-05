import type { AppLocale } from "#/lib/i18n";
import { formatDurationLabel } from "#/lib/trading/backtest-analytics";

export function backtestIntlLocale(locale: AppLocale) {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

export function formatBacktestFullDateTime(timestamp: number, locale: AppLocale) {
  return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export function formatBacktestDateWithWeekday(timestamp: number, locale: AppLocale) {
  return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(timestamp));
}

export function formatBacktestTimeOnly(timestamp: number, locale: AppLocale) {
  return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export function formatBacktestDateOnly(timestamp: number, locale: AppLocale) {
  return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function formatBacktestWeekday(
  timestamp: number,
  locale: AppLocale,
  style: "long" | "short" = "long",
) {
  return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
    weekday: style,
  }).format(new Date(timestamp));
}

export function formatBacktestCompactDateTime(timestamp: number, locale: AppLocale) {
  const date = formatBacktestDateWithWeekday(timestamp, locale);
  const time = formatBacktestTimeOnly(timestamp, locale);
  return `${date} ${time}`;
}

export function formatBacktestAxisTime(timestamp: number, spanMs: number, locale: AppLocale) {
  const date = new Date(timestamp);
  const spanDays = spanMs / (24 * 60 * 60 * 1000);

  if (spanDays <= 2) {
    return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  if (spanDays <= 120) {
    return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
      month: "numeric",
      day: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(backtestIntlLocale(locale), {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatBacktestDateRange(
  start: number,
  end: number,
  locale: AppLocale,
  isZh: boolean,
) {
  const spanMs = Math.max(end - start, 0);
  const spanDays = Math.ceil(spanMs / (24 * 60 * 60 * 1000));
  const startLabel = formatBacktestDateOnly(start, locale);
  const endLabel = formatBacktestDateOnly(end, locale);
  const spanLabel = isZh ? `${spanDays} 天` : `${spanDays} days`;
  return `${startLabel} – ${endLabel} · ${spanLabel}`;
}

export function formatBacktestElapsedFromStart(
  timestamp: number,
  start: number,
  locale: AppLocale,
) {
  const elapsedMs = Math.max(timestamp - start, 0);
  const isZh = locale === "zh-CN";
  const duration = formatDurationLabel(elapsedMs);

  if (elapsedMs < 24 * 60 * 60 * 1000) {
    return isZh ? `回测开始后 ${duration}` : `${duration} after backtest start`;
  }

  const dayIndex = Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1;
  return isZh ? `回测第 ${dayIndex} 天 · ${duration}` : `Day ${dayIndex} · ${duration}`;
}

export function resolveBacktestTimeSpan(times: Array<number | undefined>) {
  const validTimes = times.filter((time): time is number => typeof time === "number");
  if (validTimes.length < 2) return { start: 0, end: 0, spanMs: 0 };
  const start = Math.min(...validTimes);
  const end = Math.max(...validTimes);
  return { start, end, spanMs: end - start };
}

export function pickAxisTickIndices(length: number, maxTicks = 7) {
  if (length <= 0) return [];
  if (length <= maxTicks) return Array.from({ length }, (_, index) => index);

  const indices = new Set<number>([0, length - 1]);
  const step = (length - 1) / (maxTicks - 1);
  for (let index = 1; index < maxTicks - 1; index += 1) {
    indices.add(Math.round(index * step));
  }

  return [...indices].sort((left, right) => left - right);
}
