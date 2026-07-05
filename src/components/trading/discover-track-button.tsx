import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import { $addTrader } from "#/lib/trading/repository";
import { rankItemToTraderDraft } from "#/lib/trading/track-trader-from-discover";
import type { TraderRankItem } from "#/lib/trading/trader-rank-types";
import { cn } from "#/lib/utils";

export function DiscoverTrackButton(props: {
  item: TraderRankItem;
  tracked: boolean;
  className?: string;
  size?: "sm" | "default";
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const size = props.size ?? "sm";

  const mutation = useMutation({
    mutationFn: async () => {
      const draft = rankItemToTraderDraft(props.item);
      return $addTrader({
        data: {
          id: draft.id,
          name: draft.name,
          platform: draft.platform,
          link: draft.link,
          avatar: draft.avatar,
          strategyName: draft.strategyName,
          strategyStatus: draft.strategyStatus,
        },
      });
    },
    onSuccess: async () => {
      toast.success(t("discover.trackAdded", { name: props.item.nickName }));
      await queryClient.invalidateQueries({ queryKey: ["trading", "traders"] });
    },
    onError: (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      toast.error(t("discover.trackFailed", { error: detail }));
    },
  });

  if (props.tracked) {
    return (
      <Button
        type="button"
        variant="secondary"
        size={size}
        className={cn("gap-1.5", props.className)}
        render={<Link to="/app/traders/$traderId" params={{ traderId: props.item.traderId }} />}
        nativeButton={false}
        onClick={(event) => event.stopPropagation()}
      >
        {t("discover.tracked")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn("gap-1.5", props.className)}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate();
      }}
    >
      <UserPlusIcon className="size-4" />
      {mutation.isPending ? t("discover.tracking") : t("discover.track")}
    </Button>
  );
}
