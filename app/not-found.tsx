import Link from "next/link";

export default function NotFound() {
  return (
    <div className="err-page">
      <div className="err-card">
        <div className="err-code">404</div>
        <h1 className="err-title">Page not found</h1>
        <p className="err-text">
          Хайсан хуудас байхгүй эсвэл шилжүүлэгдсэн байна.
        </p>
        <div className="err-actions">
          <Link href="/home" className="err-btn err-btn--primary">
            Home
          </Link>
          <Link href="/" className="err-btn err-btn--ghost">
            Landing
          </Link>
        </div>
      </div>
    </div>
  );
}
