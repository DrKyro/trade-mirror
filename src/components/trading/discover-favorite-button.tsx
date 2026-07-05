import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StarIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import { discoverFavoriteKey } from "#/lib/trading/discover-favorites";
import { $toggleDiscoverFavorite } from "#/lib/trading/discover-repository";
import type { TraderPlatform } from "#/lib/trading/types";
import { cn } from "#/lib/utils";

export type DiscoverFavoriteTarget = {
  platform: TraderPlatform;
  traderId: string;
  uniqueName: string;
  nickName: string;
  avatar?: string;
  link?: string;
};

export function DiscoverFavoriteButton(props: {
  trader: DiscoverFavoriteTarget;
  favorited: boolean;
  className?: string;
  size?: "sm" | "icon";
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const size = props.size ?? "icon";

  const mutation = useMutation({
    mutationFn: async (favorite: boolean) =>
      $toggleDiscoverFavorite({
        data: {
          platform: props.trader.platform,
          traderId: props.trader.traderId,
          uniqueName: props.trader.uniqueName,
          nickName: props.trader.nickName,
          avatar: props.trader.avatar,
          link: props.trader.link,
          favorite,
        },
      }),
    onMutate: async (favorite) => {
      await queryClient.cancelQueries({ queryKey: ["discover", "favorites"] });
      const previous = queryClient.getQueryData<Array<{ platform: string; traderId: string }>>([
        "discover",
        "favorites",
      ]);

      queryClient.setQueryData(
        ["discover", "favorites"],
        (current: typeof previous | undefined) => {
          const list = current ?? [];
          const key = discoverFavoriteKey(props.trader.platform, props.trader.traderId);
          if (favorite) {
            if (list.some((item) => discoverFavoriteKey(item.platform, item.traderId) === key)) {
              return list;
            }
            return [
              {
                platform: props.trader.platform,
                traderId: props.trader.traderId,
                uniqueName: props.trader.uniqueName,
                nickName: props.trader.nickName,
                avatar: props.trader.avatar ?? "",
                link: props.trader.link ?? "",
                createdAt: Date.now(),
              },
              ...list,
            ];
          }
          return list.filter((item) => discoverFavoriteKey(item.platform, item.traderId) !== key);
        },
      );

      return { previous };
    },
    onError: (_error, _favorite, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["discover", "favorites"], context.previous);
      }
      toast.error(t("discover.favoriteFailed"));
    },
    onSuccess: (_result, favorite) => {
      toast.success(favorite ? t("discover.favoriteAdded") : t("discover.favoriteRemoved"));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["discover", "favorites"] });
    },
  });

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={cn(
        size === "icon" ? "size-8 shrink-0" : "h-8 gap-1.5 px-2",
        props.favorited ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground",
        props.className,
      )}
      disabled={mutation.isPending}
      aria-pressed={props.favorited}
      aria-label={props.favorited ? t("discover.unfavoriteTrader") : t("discover.favoriteTrader")}
      title={props.favorited ? t("discover.unfavoriteTrader") : t("discover.favoriteTrader")}
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate(!props.favorited);
      }}
    >
      <StarIcon className={cn("size-4", props.favorited ? "fill-current" : "")} />
      {size === "sm" ? (
        <span className="text-xs">
          {props.favorited ? t("discover.favorited") : t("discover.favorite")}
        </span>
      ) : null}
    </Button>
  );
}
