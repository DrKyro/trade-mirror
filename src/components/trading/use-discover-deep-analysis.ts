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

const DISABLED_DEEP_QUERY_KEY = ["discover", "deep", "disabled"] as const;

export function useDiscoverDeepAnalysis(
  platform: TraderPlatform | undefined,
  traderId: string | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const refreshAttemptedRef = useRef(false);
  const mountedRef = useRef(true);

  const active = enabled && platform !== undefined && traderId !== undefined && traderId.length > 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshAttemptedRef.current = false;
    };
  }, []);

  const query = useQuery({
    queryKey: active ? discoverDeepQueryKey(platform, traderId) : DISABLED_DEEP_QUERY_KEY,
    queryFn: ({ signal }) =>
      $fetchTraderDeepAnalysis({
        signal,
        data: { platform: platform!, traderId: traderId!, window: "all" },
      }),
    enabled: active,
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      $refreshTraderDeepAnalysis({
        data: { platform: platform!, traderId: traderId! },
      }),
    onSuccess: (result) => {
      if (!mountedRef.current || !platform || !traderId) return;
      const next: TraderDeepAnalysisResponse = {
        status: "ready",
        analysis: result.analysis,
        crawledAt: result.crawledAt,
      };
      queryClient.setQueryData(discoverDeepQueryKey(platform, traderId), next);
    },
    onError: () => {
      if (mountedRef.current) {
        refreshAttemptedRef.current = false;
      }
    },
  });

  useEffect(() => {
    if (!active) return;

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
      void refreshMutation.mutateAsync().catch(() => {
        if (mountedRef.current) {
          refreshAttemptedRef.current = false;
        }
      });
    }
  }, [active, query.data?.status, refreshMutation.isPending]);

  const isRefreshing =
    refreshMutation.isPending || (query.data?.status === "pending" && refreshAttemptedRef.current);

  return {
    query,
    refreshMutation,
    isRefreshing,
    refreshFailed: refreshMutation.isError,
  };
}
