import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

/**
 * /robots.txt — emitted by Next at build/runtime from this file.
 *
 * Strategy:
 *   - Allow indexing of public marketing + content pages (`/`, `/post`, `/[username]`,
 *     `/hashtag`, `/series`, `/category`, `/pricing`, `/legal`).
 *   - Disallow everything tied to a logged-in session (`/api`, `/settings`,
 *     `/messages`, `/notifications`, `/drafts`, `/saved`, `/admin`, `/auth/*`)
 *     so we don't waste crawl budget on pages that 401 or render a login wall.
 *   - Reference the sitemap so search engines pick up the dynamic index.
 *   - Block known scraper LLM bots from training — opt-in only.
 *     (Add new bots here as they emerge: GPTBot, ClaudeBot, Bytespider, etc.)
 */
export default function robots(): MetadataRoute.Robots {
  const host = siteUrl().host;
  const sitemap = absoluteUrl("/sitemap.xml");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/admin",
          "/admin/",
          "/auth/",
          "/login",
          "/register",
          "/onboarding",
          "/settings",
          "/settings/",
          "/messages",
          "/messages/",
          "/notifications",
          "/drafts",
          "/saved",
          "/safe-social",
          "/oauth/",
        ],
      },
      // AI training scrapers — opt-out by default, matching the convention
      // used by major publishers. Operators can flip this when they decide
      // to license training data.
      { userAgent: "GPTBot", disallow: ["/"] },
      { userAgent: "ChatGPT-User", disallow: ["/"] },
      { userAgent: "OAI-SearchBot", disallow: ["/"] },
      { userAgent: "ClaudeBot", disallow: ["/"] },
      { userAgent: "Claude-Web", disallow: ["/"] },
      { userAgent: "anthropic-ai", disallow: ["/"] },
      { userAgent: "CCBot", disallow: ["/"] },
      { userAgent: "PerplexityBot", disallow: ["/"] },
      { userAgent: "Bytespider", disallow: ["/"] },
      { userAgent: "Google-Extended", disallow: ["/"] },
    ],
    sitemap,
    host,
  };
}
