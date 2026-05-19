import "../../profile.css";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProfileScreen } from "@/components/profile-screen";
import { RESERVED_USERNAME_PATHS } from "@/lib/user-url";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { getMediaUrl } from "@/lib/media";
import type { Metadata } from "next";

async function loadProfileForMetadata(username: string) {
  try {
    return await prisma.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        isVerified: true,
        createdAt: true,
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  if (RESERVED_USERNAME_PATHS.has(username.toLowerCase())) {
    return { robots: { index: false, follow: false } };
  }

  const user = await loadProfileForMetadata(username);
  if (!user) {
    return {
      title: `@${username}`,
      description: "View this profile on Linksy.",
      alternates: { canonical: `/${encodeURIComponent(username)}` },
      robots: { index: false, follow: false },
    };
  }

  const verifiedSuffix = user.isVerified ? " · Verified" : "";
  const title = `${user.displayName || user.username} (@${user.username})${verifiedSuffix}`;
  const stats = `${user._count.followers} followers · ${user._count.following} following · ${user._count.posts} posts`;
  const description = user.bio?.trim() ? `${user.bio.trim()} — ${stats}` : stats;

  const avatar = user.avatarUrl
    ? absoluteUrl(getMediaUrl(user.avatarUrl) ?? user.avatarUrl)
    : undefined;

  const canonical = `/${encodeURIComponent(user.username)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: absoluteUrl(canonical),
      siteName: "Linksy",
      images: avatar ? [{ url: avatar }] : undefined,
      // OG profile properties (per https://ogp.me/#type_profile).
      username: user.username,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: avatar ? [avatar] : undefined,
      creator: `@${user.username}`,
    },
  };
}

export default async function UsernameProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  if (RESERVED_USERNAME_PATHS.has(username.toLowerCase())) {
    notFound();
  }

  const user = await loadProfileForMetadata(username);

  return (
    <div className="linksy-profile-route">
      {user ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ProfilePage",
              dateCreated: user.createdAt.toISOString(),
              mainEntity: {
                "@type": "Person",
                name: user.displayName || user.username,
                alternateName: user.username,
                description: user.bio ?? undefined,
                url: absoluteUrl(`/${encodeURIComponent(user.username)}`),
                image: user.avatarUrl
                  ? absoluteUrl(getMediaUrl(user.avatarUrl) ?? user.avatarUrl)
                  : undefined,
                interactionStatistic: [
                  {
                    "@type": "InteractionCounter",
                    interactionType: "https://schema.org/FollowAction",
                    userInteractionCount: user._count.followers,
                  },
                  {
                    "@type": "InteractionCounter",
                    interactionType: "https://schema.org/WriteAction",
                    userInteractionCount: user._count.posts,
                  },
                ],
              },
            }),
          }}
        />
      ) : null}
      <Suspense>
        <ProfileScreen targetUsername={username} />
      </Suspense>
    </div>
  );
}
