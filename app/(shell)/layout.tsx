import { AppShell } from "@/components/app-shell";

/**
 * Shared chrome for authenticated app routes: the AppShell (nav rails,
 * notifications dropdown, create modal, SSE subscription, focus/poll
 * listeners) mounts once for the route group and persists across
 * client-side navigations between any child route. Routes outside this
 * group (`/home`, `/login`, `/auth/*`, etc.) intentionally render
 * without it.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
