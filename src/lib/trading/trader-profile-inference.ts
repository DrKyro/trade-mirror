import "@tanstack/react-start/server-only";
import type { TraderDraftInput } from "#/lib/trading/trader-defaults";

export interface TraderProfileInference {
  name?: string;
  nickName?: string;
  avatar?: string;
  sign?: string;
}

interface BinanceProfilePayload {
  code?: string;
  success?: boolean;
  message?: string | null;
  data?: {
    nickname?: string;
    avatarUrl?: string;
    description?: string;
  } | null;
}

function buildOkxHeaders(traderId: string): HeadersInit {
  return {
    accept: "application/json",
    "accept-language": "zh-CN,zh;q=0.9",
    "app-type": "web",
    devId: "95829674-6cd6-4909-a00e-d4ebd89d7a71",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-cdn": "https://static.okx.com",
    "x-locale": "zh_CN",
    "x-utc": "8",
    "x-zkdex-env": "0",
    Referer: `https://www.okx.com/cn/copy-trading/account/${traderId}`,
  };
}

async function fetchOkxProfile(traderId: string) {
  const response = await fetch(
    `https://www.okx.com/priapi/v5/ecotrade/public/basic-info?uniqueName=${traderId}`,
    {
      headers: buildOkxHeaders(traderId),
    },
  );

  if (!response.ok) {
    throw new Error(`OKX profile request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: string;
    msg?: string;
    data?: Array<{
      nickName?: string;
      portrait?: string;
      sign?: string;
    }>;
  };

  if (payload.code !== "0") {
    throw new Error(`OKX profile payload error: ${payload.msg ?? JSON.stringify(payload)}`);
  }

  const basicInfo = payload.data?.[0];
  if (!basicInfo) {
    return null;
  }

  return {
    name: basicInfo.nickName,
    nickName: basicInfo.nickName,
    avatar: basicInfo.portrait,
    sign: basicInfo.sign,
  } satisfies TraderProfileInference;
}

function buildBinanceHeaders(traderId: string): HeadersInit {
  return {
    accept: "*/*",
    "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: `https://www.binance.com/zh-CN/copy-trading/lead-details?portfolioId=${encodeURIComponent(
      traderId,
    )}&timeRange=30D`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  };
}

async function fetchBinanceProfile(traderId: string) {
  const response = await fetch(
    `https://www.binance.com/bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/detail?portfolioId=${encodeURIComponent(
      traderId,
    )}`,
    {
      headers: buildBinanceHeaders(traderId),
    },
  );

  if (!response.ok) {
    throw new Error(`Binance profile request failed with ${response.status}`);
  }

  const payload = (await response.json()) as BinanceProfilePayload;
  if (payload.success === false) {
    throw new Error(`Binance profile payload error: ${payload.message ?? JSON.stringify(payload)}`);
  }

  const detail = payload.data;
  if (!detail) {
    return null;
  }

  return {
    name: detail.nickname,
    nickName: detail.nickname,
    avatar: detail.avatarUrl,
    sign: detail.description,
  } satisfies TraderProfileInference;
}

export async function inferTraderProfile(
  draft: Pick<TraderDraftInput, "id" | "platform">,
): Promise<TraderProfileInference | null> {
  switch (draft.platform) {
    case "okx":
      return fetchOkxProfile(draft.id);
    case "binance":
    case "binanceFutures":
      return fetchBinanceProfile(draft.id);
    default:
      return null;
  }
}
