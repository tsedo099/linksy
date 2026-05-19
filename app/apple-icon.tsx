import { ImageResponse } from "next/og";

/**
 * 180×180 Apple touch icon — used when a user "Add to Home Screen" on iOS.
 * Next.js maps this file to `<link rel="apple-touch-icon">` automatically.
 *
 * Same colour palette as `app/icon.tsx` so the brand stays consistent across
 * the browser tab + the iOS home screen.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 120,
          fontWeight: 800,
          color: "#0b0418",
          background: "linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)",
          borderRadius: 36,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: -4,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
