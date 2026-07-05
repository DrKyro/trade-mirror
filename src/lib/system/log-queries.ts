import { queryOptions } from "@tanstack/react-query";

import {
  $listLogs,
  $listTeacherLogsForCurrentUser,
  $readLog,
  $readTeacherLogForCurrentUser,
} from "#/lib/system/log-repository";

export const logsQueryOptions = () =>
  queryOptions({
    queryKey: ["system", "logs"],
    queryFn: ({ signal }) => $listLogs({ signal }),
  });

export const logContentQueryOptions = (sourceKey: string, relativePath: string) =>
  queryOptions({
    queryKey: ["system", "logs", sourceKey, relativePath],
    queryFn: ({ signal }) =>
      $readLog({
        signal,
        data: {
          sourceKey,
          relativePath,
        },
      }),
  });

export const accountLogsQueryOptions = (accountId: string) =>
  queryOptions({
    queryKey: ["system", "account-logs", accountId],
    queryFn: ({ signal }) =>
      $listTeacherLogsForCurrentUser({
        signal,
        data: {
          teacherId: accountId,
        },
      }),
  });

export const accountLogContentQueryOptions = (
  accountId: string,
  sourceKey: string,
  relativePath: string,
) =>
  queryOptions({
    queryKey: ["system", "account-logs", accountId, sourceKey, relativePath],
    queryFn: ({ signal }) =>
      $readTeacherLogForCurrentUser({
        signal,
        data: {
          teacherId: accountId,
          sourceKey,
          relativePath,
        },
      }),
  });

/** @deprecated Use accountLogsQueryOptions */
export const teacherLogsQueryOptions = accountLogsQueryOptions;

/** @deprecated Use accountLogContentQueryOptions */
export const teacherLogContentQueryOptions = accountLogContentQueryOptions;
