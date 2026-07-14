import "server-only";
import { NextRequest, NextResponse } from "next/server";

/**
 * Los content scripts de la extensión de Chrome (order-watcher.js) hacen
 * fetch() directamente desde el contexto de la página de TikTok, así que esas
 * peticiones SÍ están sujetas al CORS del navegador (a diferencia de las que
 * hace el service worker en segundo plano, que lo bypasea). Sin estas
 * cabeceras, el navegador bloquea la petición antes de que llegue aquí.
 */
const ALLOWED_ORIGINS = new Set(["https://seller-es.tiktok.com", "https://shop.tiktok.com"]);

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-el-sign",
    Vary: "Origin",
  };
}

export function corsPreflight(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    res.headers.set(key, value);
  }
  return res;
}
