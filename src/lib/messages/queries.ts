import { queryOptions } from "@tanstack/react-query";

import {
  $getLegacyChainInfos,
  $getLegacyCounts,
  $getLegacyMessages,
  $getLegacyUserAccountSetting,
} from "#/lib/messages/repository";
import { $updateLegacyUserAccountSetting } from "#/lib/messages/repository";

export const legacyMessagesQueryOptions = (limit = 50, offset = 0) =>
  queryOptions({
    queryKey: ["messages", "legacy-messages", limit, offset],
    queryFn: ({ signal }) => $getLegacyMessages({ signal, data: { limit, offset } }),
  });

export const legacyChainInfosQueryOptions = (limit = 50, offset = 0) =>
  queryOptions({
    queryKey: ["messages", "legacy-chain-infos", limit, offset],
    queryFn: ({ signal }) => $getLegacyChainInfos({ signal, data: { limit, offset } }),
  });

export const legacyCountsQueryOptions = () =>
  queryOptions({
    queryKey: ["messages", "legacy-counts"],
    queryFn: ({ signal }) => $getLegacyCounts({ signal }),
  });

export const legacyUserAccountSettingQueryOptions = () =>
  queryOptions({
    queryKey: ["messages", "legacy-account-setting"],
    queryFn: ({ signal }) => $getLegacyUserAccountSetting({ signal }),
  });

export { $updateLegacyUserAccountSetting };
