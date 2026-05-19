"use client";

import { displayMediaSrc } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { useCurrentUserAvatar } from "@/components/current-user-avatar";
import Image from "next/image";
import { memo } from "react";

import type { ApiStoryGroup } from "./feed-story-model";
import { STORY_GRADS } from "./feed-story-constants";

export const StoriesRow = memo(function StoriesRow({
  onOpen,
  groups,
  myStoryGroup,
  onAddStory,
  onViewMyStory,
}: {
  onOpen: (idx: number) => void;
  groups: ApiStoryGroup[];
  myStoryGroup: ApiStoryGroup | null;
  onAddStory: () => void;
  onViewMyStory: () => void;
}) {
  const currentUser = useCurrentUserAvatar();
  const myInitials = currentUser?.displayName?.slice(0, 2).toUpperCase() ?? "+";
  const myGrad = STORY_GRADS[0];
  const myStoryViewed = Boolean(myStoryGroup?.allViewed);

  return (
    <div className="sbar-card">
      <div className="stories-row">
        <div
          className={`story-item story-item--me${myStoryViewed ? " story-item--viewed" : ""}`}
        >
          <button
            type="button"
            className={`story-ring${myStoryGroup ? "" : " story-ring--add"}`}
            onClick={() => {
              if (!myStoryGroup) {
                onAddStory();
                return;
              }
              onViewMyStory();
            }}
            aria-label={myStoryGroup ? "View my story" : "Add story"}
          >
            {currentUser?.avatarUrl ? (
              <Image
                src={displayMediaSrc(currentUser.avatarUrl) ?? currentUser.avatarUrl}
                className="story-avatar story-avatar--img"
                alt=""
                width={96}
                height={96}
                sizes="72px"
                priority
                unoptimized={shouldUnoptimizeNextImageSrc(
                  displayMediaSrc(currentUser.avatarUrl) ?? currentUser.avatarUrl,
                )}
              />
            ) : currentUser ? (
              <div className="story-avatar" style={{ background: myGrad }}>{myInitials}</div>
            ) : (
              <div className="story-avatar story-avatar--add">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
            )}
          </button>
          {currentUser && (
            <button
              type="button"
              className="story-add-badge"
              onClick={(event) => {
                event.stopPropagation();
                onAddStory();
              }}
              aria-label="Add another story"
            >
              +
            </button>
          )}
          <span className="story-name">Your story</span>
        </div>

        {groups.map((g, i) => {
          const grad = STORY_GRADS[i % STORY_GRADS.length];
          const initials = g.author.displayName.slice(0, 2).toUpperCase();
          const isViewed = g.allViewed;
          const avatarLoading = i < 6 ? "eager" as const : "lazy" as const;
          return (
            <button
              key={g.authorId}
              className={`story-item${isViewed ? " story-item--viewed" : ""}${g.isCloseCircle ? " story-item--circle" : ""}`}
              onClick={() => onOpen(i)}
            >
              <div className="story-ring">
                {g.author.avatarUrl ? (
                  <Image
                    src={displayMediaSrc(g.author.avatarUrl) ?? g.author.avatarUrl}
                    className="story-avatar story-avatar--img"
                    alt=""
                    width={96}
                    height={96}
                    sizes="72px"
                    loading={avatarLoading}
                    priority={i < 3}
                    unoptimized={shouldUnoptimizeNextImageSrc(
                      displayMediaSrc(g.author.avatarUrl) ?? g.author.avatarUrl,
                    )}
                  />
                ) : (
                  <div className="story-avatar" style={{ background: grad }}>{initials}</div>
                )}
                {g.isCloseCircle && <span className="story-circle-badge">🔒</span>}
              </div>
              <span className="story-name">{g.author.username}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
