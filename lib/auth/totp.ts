import "server-only";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Etiqueta Live";

export function generateTotpSecret(): string {
  return generateSecret();
}

export async function generateTotpQrDataUrl(email: string, secret: string): Promise<string> {
  const otpauth = generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(otpauth);
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: code, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
