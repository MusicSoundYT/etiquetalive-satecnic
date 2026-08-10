import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listAuctionOrders } from "@/lib/tiktok-shop/auction-orders";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const pageToken = req.nextUrl.searchParams.get("page_token") ?? undefined;
  const shopId = req.nextUrl.searchParams.get("shop_id") ?? undefined;

  try {
    const result = await listAuctionOrders(user.tenant_id, { pageToken, shopId });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[TikTok Shop] Error listando pedidos de subasta:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
