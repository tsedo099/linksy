import type { GlobalProvider } from "@ladle/react";
import "../app/styles/tailwind.css";
import "../app/globals.css";

/**
 * Wrap every story in the same root attributes as `app/layout.tsx` so the
 * `data-theme` / `data-accent` selectors that drive the live app's CSS
 * variables actually paint inside the Ladle preview.
 */
export const Provider: GlobalProvider = ({ children, globalState }) => {
  const theme = globalState.theme === "light" ? "light" : "dark";
  return (
    <div
      data-theme={theme}
      data-accent="purple"
      data-font-scale="medium"
      data-motion="full"
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "var(--app-background)",
        color: "var(--app-text)",
      }}
    >
      {children}
    </div>
  );
};
