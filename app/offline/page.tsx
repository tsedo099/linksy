import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline · Linksy",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="err-page">
      <div className="err-card">
        <div className="err-code">⚡</div>
        <h1 className="err-title">You are offline</h1>
        <p className="err-text">
          Сүлжээ алга байна. Сүүлд үзсэн контент кэшээс ачаалагдана,
          таны үйлдлүүд холбогдсон даруйд автоматаар илгээгдэнэ.
        </p>
        <div className="err-actions">
          <Link href="/home" className="err-btn err-btn--primary">
            Home
          </Link>
          <Link href="/notifications" className="err-btn err-btn--ghost">
            Notifications
          </Link>
        </div>
      </div>
    </div>
  );
}
