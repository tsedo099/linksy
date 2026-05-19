import LandingScreen from "@/components/landing-screen";
import { absoluteUrl } from "@/lib/site-url";
import type { Metadata } from "next";

const TITLE = "Linksy — personalized social, themed your way";
const DESCRIPTION =
  "Linksy is a modern social network with personalized themes, end-to-end encrypted DMs, stories, and creator tools.";
const DESCRIPTION_MN =
  "Linksy — өөрийн загвартай орчин үеийн нийгмийн сүлжээ. Хувийн theme, end-to-end шифрлэгдсэн зурвас, story, бүтээгчдийн хэрэгсэлтэй.";

const KEYWORDS = [
  "Linksy",
  "social network",
  "social media",
  "modern social platform",
  "personalized feed",
  "end-to-end encrypted DM",
  "E2EE messaging",
  "stories app",
  "creator platform",
  "themed social",
  // Mongolian keywords for `mn` audience discovery.
  "нийгмийн сүлжээ",
  "пост",
  "story",
  "зурвас",
  "creator",
];

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  alternates: {
    canonical: "/",
    languages: {
      "en": absoluteUrl("/"),
      "mn": absoluteUrl("/"),
      "x-default": absoluteUrl("/"),
    },
  },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: "Linksy",
    locale: "en_US",
    alternateLocale: ["mn_MN"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  // Localized description surfaced for `mn`-speaking crawlers /
  // social-media unfurlers that respect `og:description` per-locale.
  other: {
    "og:description:mn": DESCRIPTION_MN,
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Linksy",
            url: absoluteUrl("/"),
            description: DESCRIPTION,
            inLanguage: ["en", "mn"],
            potentialAction: {
              "@type": "SearchAction",
              target: `${absoluteUrl("/search")}?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />
      <LandingScreen />
    </>
  );
}
