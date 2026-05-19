import { ImageResponse } from "next/og";

/**
 * Dynamic 32×32 PNG favicon. Next.js automatically wires this file to
 * `/icon` and the `<link rel="icon">` tag — no manual `<head>` work.
 *
 * The mark is a rounded gradient square with a stylised "L" so the browser
 * tab is recognisable even at 16×16. The PWA install icon + share card image
 * are served from `public/psda.png` (see `manifest.json` + `app/layout.tsx`);
 * the favicon here is rendered fresh at request time so any future palette
 * swap (e.g. seasonal accent) only needs a one-line edit in this file.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 800,
          color: "#0b0418",
          background: "linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)",
          borderRadius: 7,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: -1,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
