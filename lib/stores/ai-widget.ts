import { create } from "zustand";

type AiWidgetState = {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
};

export const useAiWidgetStore = create<AiWidgetState>((set, get) => ({
  open: false,
  setOpen: (next) => set({ open: next }),
  toggle: () => set({ open: !get().open }),
}));
