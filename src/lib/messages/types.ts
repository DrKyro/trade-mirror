export type LegacyJsonPrimitive = string | number | boolean | null;
export interface LegacyJsonArray extends Array<
  LegacyJsonPrimitive | LegacyJsonObject | LegacyJsonArray
> {}

export interface LegacyJsonObject {
  [key: string]: LegacyJsonPrimitive | LegacyJsonObject | LegacyJsonArray;
}

export type LegacyJsonValue = LegacyJsonPrimitive | LegacyJsonObject | LegacyJsonArray;

export type LegacyMessageData = Record<string, LegacyJsonValue> & {
  msgTitle: string;
  msgAvatar: string;
  msgReleaseTime: string;
  msgCollectionTime: number;
  msgContent: string;
  msgContentTranslate: string;
  msgFiles: string[];
  msgUrl: string;
};

export interface LegacyMessageRecord {
  id: string;
  msgClass: string;
  msgSource: string;
  uniqueId: string | null;
  messageTime: number | null;
  msgData: LegacyMessageData;
  createdAt: number;
}

export interface LegacyChainInfoRecord {
  id: string;
  transactionHash: string | null;
  data: LegacyJsonObject;
  createdAt: number;
}

export interface LegacyUserAccountSetting {
  userId: string;
  binanceApiKey: string;
  binanceSecretKey: string;
  updatedAt: number;
}
