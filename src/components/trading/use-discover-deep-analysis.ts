import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
  $fetchTraderDeepAnalysis,
  $refreshTraderDeepAnalysis,
} from "#/lib/trading/discover-repository";
import type { TraderDeepAnalysisResponse } from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

export function discoverDeepQueryKey(platform: TraderPlatform, traderId: string) {
  return ["discover", "deep", platform, traderId] as const;
}

export function useDiscoverDeepAnalysis(
  platform: TraderPlatform | undefined,
  traderId: string | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const refreshAttemptedRef = useRef(false);

  const query = useQuery({
    queryKey: discoverDeepQueryKey(platform ?? "okx", traderId ?? ""),
    queryFn: ({ signal }) =>
      $fetchTraderDeepAnalysis({
        signal,
        data: { platform: platform!, traderId: traderId!, window: "all" },
      }),
    enabled: enabled && platform !== undefined && traderId !== undefined && traderId.length > 0,
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      $refreshTraderDeepAnalysis({
        data: { platform: platform!, traderId: traderId! },
      }),
    onSuccess: (result) => {
      if (!platform || !traderId) return;
      const next: TraderDeepAnalysisResponse = {
        status: "ready",
        analysis: result.analysis,
        crawledAt: result.crawledAt,
      };
      queryClient.setQueryData(discoverDeepQueryKey(platform, traderId), next);
    },
    onError: () => {
      refreshAttemptedRef.current = false;
    },
  });

  useEffect(() => {
    if (!enabled) {
      refreshAttemptedRef.current = false;
      return;
    }

    if (query.data?.status === "ready") {
      refreshAttemptedRef.current = false;
      return;
    }

    if (
      query.data?.status === "pending" &&
      !refreshAttemptedRef.current &&
      !refreshMutation.isPending
    ) {
      refreshAttemptedRef.current = true;
      void refreshMutation.mutateAsync().catch(() => undefined);
    }
  }, [enabled, query.data?.status, refreshMutation.isPending, refreshMutation.mutateAsync]);

  const isRefreshing =
    refreshMutation.isPending || (query.data?.status === "pending" && refreshAttemptedRef.current);

  return {
    query,
    refreshMutation,
    isRefreshing,
    refreshFailed: refreshMutation.isError,
  };
}
