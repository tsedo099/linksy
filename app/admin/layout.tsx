import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LINKSY_ACCESS_COOKIE } from "@/lib/auth-cookies";
import { verifyAccessToken } from "@/lib/jwt";
import { isSafetyAdmin } from "@/lib/admin-auth";

/**
 * Route-group guard for everything under `/admin/*`. Runs server-side on
 * every request to a child page, so admin UI is never rendered for a
 * non-admin even briefly (no client-side flash). Forbidden visitors are
 * redirected to `/login?next=/admin` so they can authenticate and bounce
 * back.
 *
 * The actual UI lives in the existing `AdminPanelScreen` client component;
 * this layout just gates access before it loads.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const access = cookieStore.get(LINKSY_ACCESS_COOKIE)?.value;
  const payload = access ? verifyAccessToken(access) : null;

  if (!payload) {
    redirect("/login?next=/admin");
  }

  const allowed = await isSafetyAdmin(payload.userId);
  if (!allowed) {
    // 404-equivalent: don't disclose that /admin even exists to non-admins.
    redirect("/");
  }

  return <>{children}</>;
}
