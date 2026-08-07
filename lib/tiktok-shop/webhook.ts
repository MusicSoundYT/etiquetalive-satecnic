import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Firma de los webhooks entrantes de TikTok Shop — un algoritmo DISTINTO al
 * de las peticiones que nosotros hacemos a su API (sign.ts). Aquí es
 * HMAC-SHA256(app_key + cuerpo en crudo, app_secret), en hexadecimal, y
 * viaja en la cabecera Authorization SIN el prefijo "Bearer".
 */
export function verifyWebhookSignature(rawBody: string, appKey: string, appSecret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", appSecret).update(appKey + rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}

export type TikTokOrderStatusChangePayload = {
  type: number;
  tts_notification_id: string;
  shop_id: string;
  timestamp: number;
  data: {
    order_id: string;
    order_status: string;
    is_on_hold_order?: boolean;
    update_time: number;
  };
};
