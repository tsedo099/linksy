export type StoryViewedEvent = {
  storyId: string;
  authorId: string;
  viewedAt: number;
};

const STORY_VIEWED_CHANNEL = "linksy-story-viewed";

function normalizeStoryViewedEvent(value: unknown): StoryViewedEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StoryViewedEvent>;
  if (typeof item.storyId !== "string" || typeof item.authorId !== "string") return null;

  return {
    storyId: item.storyId,
    authorId: item.authorId,
    viewedAt: typeof item.viewedAt === "number" ? item.viewedAt : Date.now(),
  };
}

export function emitStoryViewed(event: Omit<StoryViewedEvent, "viewedAt">) {
  if (typeof window === "undefined") return;

  const payload: StoryViewedEvent = { ...event, viewedAt: Date.now() };
  try {
    const channel = new BroadcastChannel(STORY_VIEWED_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {}

  try {
    localStorage.setItem(STORY_VIEWED_CHANNEL, JSON.stringify(payload));
  } catch {}
}

export function listenStoryViewed(onEvent: (event: StoryViewedEvent) => void) {
  if (typeof window === "undefined") return () => {};

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(STORY_VIEWED_CHANNEL);
    channel.onmessage = (message) => {
      const event = normalizeStoryViewedEvent(message.data);
      if (event) onEvent(event);
    };
  } catch {}

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORY_VIEWED_CHANNEL || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue);
      const storyEvent = normalizeStoryViewedEvent(parsed);
      if (storyEvent) onEvent(storyEvent);
    } catch {}
  };

  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
