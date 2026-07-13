import "server-only";
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { validateApiKey } from "@/lib/auth/api-key-auth";

export type TenantContext = { tenantId: string; userId: string | null };

/** Dashboard web (cookie de sesión) o extensión Chrome (x-api-key) — cualquiera de los dos. */
export async function resolveTenantContext(req: NextRequest): Promise<TenantContext | null> {
  const sessionUser = await getSessionUser();
  if (sessionUser?.tenant_id) {
    return { tenantId: sessionUser.tenant_id, userId: sessionUser.id };
  }

  const tenantId = await validateApiKey(req);
  if (tenantId) return { tenantId, userId: null };

  return null;
}
