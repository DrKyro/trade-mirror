import { queryOptions } from "@tanstack/react-query";

import { $getDiscoverDataStatus } from "#/lib/trading/discover-repository";
import {
  $getAllTraders,
  $getBybitRuntimeStatus,
  $getMarketSubscriptions,
  $getNotificationConfig,
  $getRefreshScheduler,
  $getRuntimeEvents,
  $getRuntimeStatus,
  $getTeacherEvents,
  $getTeachers,
  $getTraders,
  $probeApiHealth,
} from "#/lib/trading/repository";

export const tradersQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "traders"],
    queryFn: ({ signal }) => $getTraders({ signal }),
  });

export const allTradersQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "all-traders"],
    queryFn: ({ signal }) => $getAllTraders({ signal }),
  });

export const accountsQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "accounts"],
    queryFn: ({ signal }) => $getTeachers({ signal }),
  });

/** @deprecated Use accountsQueryOptions */
export const teachersQueryOptions = accountsQueryOptions;

export const runtimeStatusQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "runtime-status"],
    queryFn: ({ signal }) => $getRuntimeStatus({ signal }),
  });

export const runtimeEventsQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "runtime-events"],
    queryFn: ({ signal }) => $getRuntimeEvents({ signal }),
  });

export const refreshSchedulerQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "refresh-scheduler"],
    queryFn: ({ signal }) => $getRefreshScheduler({ signal }),
  });

export const marketSubscriptionsQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "market-subscriptions"],
    queryFn: ({ signal }) => $getMarketSubscriptions({ signal }),
  });

export const notificationConfigQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "notification-config"],
    queryFn: ({ signal }) => $getNotificationConfig({ signal }),
  });

export const bybitRuntimeStatusQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "bybit-runtime-status"],
    queryFn: ({ signal }) => $getBybitRuntimeStatus({ signal }),
  });

export const accountEventsQueryOptions = (accountId: string) =>
  queryOptions({
    queryKey: ["trading", "account-events", accountId],
    queryFn: ({ signal }) =>
      $getTeacherEvents({
        signal,
        data: {
          teacherId: accountId,
        },
      }),
  });

/** @deprecated Use accountEventsQueryOptions */
export const teacherEventsQueryOptions = accountEventsQueryOptions;

export const apiHealthQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "api-health"],
    queryFn: ({ signal }) => $probeApiHealth({ signal }),
  });

export const discoverDataStatusQueryOptions = () =>
  queryOptions({
    queryKey: ["discover", "data-status"],
    queryFn: ({ signal }) => $getDiscoverDataStatus({ signal }),
  });
