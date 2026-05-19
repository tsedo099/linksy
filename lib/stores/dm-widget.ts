import { create } from "zustand";

/** Feed-ийн DMWidget нээх/хаах — бусад toolbar үйлдлээр хаахад import хийж ашиглаж болно. */
export const useDmWidgetStore = create<{
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
