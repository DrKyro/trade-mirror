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

export const teacherLogsQueryOptions = (teacherId: string) =>
  queryOptions({
    queryKey: ["system", "teacher-logs", teacherId],
    queryFn: ({ signal }) =>
      $listTeacherLogsForCurrentUser({
        signal,
        data: {
          teacherId,
        },
      }),
  });

export const teacherLogContentQueryOptions = (
  teacherId: string,
  sourceKey: string,
  relativePath: string,
) =>
  queryOptions({
    queryKey: ["system", "teacher-logs", teacherId, sourceKey, relativePath],
    queryFn: ({ signal }) =>
      $readTeacherLogForCurrentUser({
        signal,
        data: {
          teacherId,
          sourceKey,
          relativePath,
        },
      }),
  });
