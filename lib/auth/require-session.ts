import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

/** Para Server Components/rutas protegidas: exige sesión completa (MFA ya superada) o redirige a /login. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Igual que requireSession pero además exige rol de administrador. */
export async function requireAdminSession(): Promise<SessionUser> {
  const user = await requireSession();
  if (!user.is_admin) redirect("/dashboard");
  return user;
}
