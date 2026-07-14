import { NextResponse } from "next/server";

/**
 * Config remota que la extensión de Chrome refresca periódicamente (sin
 * autenticación: es pública e igual para todos los tenants). Si esta petición
 * falla, la extensión sigue funcionando con sus valores por defecto locales.
 */
export async function GET() {
  return NextResponse.json({
    configVersion: "server-1",
    enableApiReplay: true,
    enableControlledRefreshFallback: true,
    backgroundPollIntervalMs: 30000,
    maxCapturedRequests: 8,
    maxReplayRequestsPerPoll: 3,
    maxApiOrdersPerScan: 20,
    extensionConfigRefreshMs: 300000,
    minExtensionVersion: "1.5.0",
    updateMessage: "",
  });
}
