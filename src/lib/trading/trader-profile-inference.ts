import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import { getAdapter } from "#/lib/trading/adapters/registry";
import type { TraderDraftInput } from "#/lib/trading/trader-defaults";

export interface TraderProfileInference {
  name?: string;
  nickName?: string;
  avatar?: string;
  sign?: string;
}

export async function inferTraderProfile(
  draft: Pick<TraderDraftInput, "id" | "platform">,
): Promise<TraderProfileInference | null> {
  const adapter = getAdapter(draft.platform);
  if (!adapter.inferProfile) {
    return null;
  }
  return adapter.inferProfile(draft.id);
}
