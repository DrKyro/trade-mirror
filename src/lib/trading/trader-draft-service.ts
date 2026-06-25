import "@tanstack/react-start/server-only";
import { createTraderRecordFromDraft } from "#/lib/trading/trader-defaults";
import type { TraderDraftInput } from "#/lib/trading/trader-defaults";
import { inferTraderProfile } from "#/lib/trading/trader-profile-inference";

export async function prepareTraderRecordForCreation(input: TraderDraftInput) {
  let inferredProfile = null;

  try {
    inferredProfile = await inferTraderProfile({
      id: input.id,
      platform: input.platform,
    });
  } catch {
    inferredProfile = null;
  }

  return createTraderRecordFromDraft(input, {
    profile: inferredProfile,
  });
}
