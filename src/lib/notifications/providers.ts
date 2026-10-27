import type { DeliveryResult } from '@/lib/notifications/types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type TelegramSenderConfig = { botToken: string };
export type WhatsAppSenderConfig = {
  apiToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

const REQUEST_TIMEOUT_MS = 10_000;
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 410, 422]);

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchImpl: FetchLike
): Promise<DeliveryResult> {
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const responseCode = String(response.status);
    if (response.ok) {
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      return { ok: true, providerMessageId: extractMessageId(json), responseCode };
    }
    const errorText = await response.text().catch(() => 'unknown error');
    return {
      ok: false,
      responseCode,
      error: truncate(`${response.status}: ${errorText}`),
      permanent: PERMANENT_STATUS.has(response.status)
    };
  } catch (error) {
    // Timeouts, DNS failures and resets are transient: the worker will retry with backoff.
    return {
      ok: false,
      responseCode: 'NETWORK_ERROR',
      error: truncate(error instanceof Error ? error.message : 'network request failed'),
      permanent: false
    };
  }
}

function extractMessageId(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const telegramResult = json.result as { message_id?: number } | undefined;
  if (typeof telegramResult?.message_id === 'number') return String(telegramResult.message_id);
  const whatsappMessages = json.messages as Array<{ id?: string }> | undefined;
  if (Array.isArray(whatsappMessages) && whatsappMessages[0]?.id) return whatsappMessages[0].id;
  return null;
}

function truncate(message: string) {
  return message.length > 500 ? message.slice(0, 500) : message;
}

export function sendTelegram(
  config: TelegramSenderConfig,
  chatId: string,
  text: string,
  fetchImpl: FetchLike = fetch
): Promise<DeliveryResult> {
  return postJson(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {},
    { chat_id: chatId, text, disable_web_page_preview: true },
    fetchImpl
  );
}

export function sendWhatsApp(
  config: WhatsAppSenderConfig,
  recipient: string,
  text: string,
  fetchImpl: FetchLike = fetch
): Promise<DeliveryResult> {
  const to = recipient.replace(/\D/g, '');
  if (to.length < 8) {
    return Promise.resolve({
      ok: false,
      responseCode: 'INVALID_RECIPIENT',
      error: `WhatsApp recipient "${recipient}" is not a valid phone number`,
      permanent: true
    });
  }
  return postJson(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
    { Authorization: `Bearer ${config.apiToken}` },
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false }
    },
    fetchImpl
  );
}
