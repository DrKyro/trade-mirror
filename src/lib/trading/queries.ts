import { queryOptions } from "@tanstack/react-query";

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

export const teachersQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "teachers"],
    queryFn: ({ signal }) => $getTeachers({ signal }),
  });

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

export const teacherEventsQueryOptions = (teacherId: string) =>
  queryOptions({
    queryKey: ["trading", "teacher-events", teacherId],
    queryFn: ({ signal }) =>
      $getTeacherEvents({
        signal,
        data: {
          teacherId,
        },
      }),
  });

export const apiHealthQueryOptions = () =>
  queryOptions({
    queryKey: ["trading", "api-health"],
    queryFn: ({ signal }) => $probeApiHealth({ signal }),
  });
