import { create } from "zustand";

/**
 * Cross-screen bridge for the AI agent: the agent runs on /ai, but its
 * actions ("set caption", "open image picker") target the /create flow.
 * Push a pending draft + trigger counter from the AI side; the create
 * screen reads on mount and clears as it applies.
 */

export type PostAudience = "PUBLIC" | "FRIENDS" | "CLOSE_CIRCLE";

export type PendingPostDraft = {
  caption?: string;
  location?: string;
  audience?: PostAudience;
};

type AiAgentBridgeState = {
  pendingPostDraft: PendingPostDraft | null;
  // Bumped each time the agent asks the create flow to open the image
  // picker. The create screen `useEffect`s on this value to trigger
  // `fileInput.click()` exactly once per request, even for back-to-back
  // requests with the same target.
  imagePickerNonce: number;
  // Bumped each time the agent asks to open the Story editor modal.
  // AppShell watches this and flips `storyOpen` → the existing
  // `<CreateModal initialStep="story" />` mounts with no extra plumbing.
  storyEditorNonce: number;
  seedPostDraft: (partial: PendingPostDraft) => void;
  consumePostDraft: () => PendingPostDraft | null;
  requestImagePicker: () => void;
  requestStoryEditor: () => void;
};

export const useAiAgentBridge = create<AiAgentBridgeState>((set, get) => ({
  pendingPostDraft: null,
  imagePickerNonce: 0,
  storyEditorNonce: 0,
  seedPostDraft: (partial) => {
    set((state) => ({
      pendingPostDraft: { ...(state.pendingPostDraft ?? {}), ...partial },
    }));
  },
  consumePostDraft: () => {
    const draft = get().pendingPostDraft;
    if (draft) set({ pendingPostDraft: null });
    return draft;
  },
  requestImagePicker: () => {
    set((state) => ({ imagePickerNonce: state.imagePickerNonce + 1 }));
  },
  requestStoryEditor: () => {
    set((state) => ({ storyEditorNonce: state.storyEditorNonce + 1 }));
  },
}));
