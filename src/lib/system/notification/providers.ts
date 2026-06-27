import { readFile } from "node:fs/promises";

import { getNotificationConfig } from "#/lib/system/notification/config";
import type { NotificationAttachment } from "#/lib/system/notification/config";

export async function sendFeishuMessage(webhookUrl: string, text: string) {
  return sendFeishuMessageWithAttachments(webhookUrl, text, []);
}

async function getFeishuTenantAccessToken(appId: string, appSecret: string) {
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );

  if (!response.ok) {
    throw new Error(`Feishu tenant token request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: number;
    tenant_access_token?: string;
    msg?: string;
  };

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(payload.msg ?? "Feishu tenant token request did not return a token.");
  }

  return payload.tenant_access_token;
}

async function uploadFeishuImage(tenantAccessToken: string, attachment: NotificationAttachment) {
  const buffer = await readFile(attachment.path);
  const formData = new FormData();
  formData.append("image_type", "message");
  formData.append(
    "image",
    new Blob([buffer], { type: "image/png" }),
    attachment.path.split("/").pop() ?? "image.png",
  );

  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${tenantAccessToken}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Feishu image upload failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: number;
    data?: { image_key?: string };
    msg?: string;
  };

  if (payload.code !== 0 || !payload.data?.image_key) {
    throw new Error(payload.msg ?? "Feishu image upload did not return image_key.");
  }

  return payload.data.image_key;
}

export async function sendFeishuMessageWithAttachments(
  webhookUrl: string,
  text: string,
  attachments: NotificationAttachment[],
) {
  const config = getNotificationConfig();
  const imageKeys: string[] = [];

  if (attachments.length > 0) {
    if (!config.feishuAppId || !config.feishuAppSecret) {
      throw new Error(
        "Feishu image delivery requires ALERT_FEISHU_APP_ID and ALERT_FEISHU_APP_SECRET.",
      );
    }

    const tenantAccessToken = await getFeishuTenantAccessToken(
      config.feishuAppId,
      config.feishuAppSecret,
    );
    for (const attachment of attachments) {
      imageKeys.push(await uploadFeishuImage(tenantAccessToken, attachment));
    }
  }

  const postContent: Array<Array<Record<string, string>>> = [[{ tag: "text", text }]];

  if (imageKeys.length > 0) {
    postContent.push(imageKeys.map((imageKey) => ({ tag: "img", image_key: imageKey })));
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msg_type: "post",
      content: {
        post: {
          zh_cn: { content: postContent },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook responded with ${response.status}`);
  }
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  return sendTelegramMessageWithAttachments(botToken, chatId, text, []);
}

export async function sendTelegramMessageWithAttachments(
  botToken: string,
  chatId: string,
  text: string,
  attachments: NotificationAttachment[],
) {
  if (attachments.length === 0) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API responded with ${response.status}`);
    }
    return;
  }

  for (const [index, attachment] of attachments.entries()) {
    const formData = new FormData();
    const buffer = await readFile(attachment.path);

    formData.append("chat_id", chatId);
    formData.append(
      "photo",
      new Blob([buffer], { type: "image/png" }),
      attachment.path.split("/").pop() ?? `attachment-${index}.png`,
    );
    if (index === 0) {
      formData.append("caption", text);
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Telegram photo API responded with ${response.status}`);
    }
  }
}

export async function sendDiscordMessage(webhookUrl: string, text: string) {
  return sendDiscordMessageWithAttachments(webhookUrl, text, []);
}

export async function sendDiscordMessageWithAttachments(
  webhookUrl: string,
  text: string,
  attachments: NotificationAttachment[],
) {
  if (attachments.length === 0) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook responded with ${response.status}`);
    }
    return;
  }

  const formData = new FormData();
  formData.append("payload_json", JSON.stringify({ content: text }));

  for (const [index, attachment] of attachments.entries()) {
    const buffer = await readFile(attachment.path);
    formData.append(
      `files[${index}]`,
      new Blob([buffer], { type: "image/png" }),
      attachment.path.split("/").pop() ?? `attachment-${index}.png`,
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Discord webhook responded with ${response.status}`);
  }
}
