/** Blocked segments for `/[username]` — must mirror app/[username]/page.tsx RESERVED_USERNAMES. */
export const RESERVED_USERNAME_PATHS = new Set([
  "api",
  "_next",
  "static",
  "public",
  "ai",
  "create",
  "dashboard",
  "home",
  "login",
  "messages",
  "notifications",
  "onboarding",
  "post",
  "profile",
  "ranking",
  "register",
  "saved",
  "settings",
  "suggested",
  "search",
  "explore",
  "hashtag",
  "story",
  "auth",
  "admin",
  "help",
  "about",
  "terms",
  "privacy",
]);

/**
 * Public profile URL: `/{username}` when safe, otherwise legacy `/profile?id=…`.
 */
export function userProfileHref(input: { id: string; username?: string | null }): string {
  const raw = input.username?.trim();
  if (
    raw &&
    !RESERVED_USERNAME_PATHS.has(raw.toLowerCase())
  ) {
    return `/${encodeURIComponent(raw)}`;
  }
  return `/profile?id=${encodeURIComponent(input.id)}`;
}
