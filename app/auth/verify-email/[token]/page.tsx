"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";

type Status = "verifying" | "success" | "expired" | "error";

export default function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (r.ok) {
          setStatus("success");
        } else {
          setErrorMsg(data?.error ?? "Verification failed.");
          setStatus(
            data?.error?.toLowerCase().includes("expired") ||
              data?.error?.toLowerCase().includes("invalid")
              ? "expired"
              : "error",
          );
        }
      })
      .catch(() => {
        setErrorMsg("Network error. Please try again.");
        setStatus("error");
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        {status === "verifying" && (
          <>
            <h1 className="auth-title">Verifying email...</h1>
            <p className="auth-subtitle">Түр хүлээнэ үү.</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="auth-title">Email verified</h1>
            <p className="auth-subtitle">
              Имэйл хаяг амжилттай баталгаажлаа. Та одоо бүх онцлогийг ашиглах боломжтой.
            </p>
            <Link href="/home" className="auth-btn auth-btn--primary">
              Continue to home
            </Link>
          </>
        )}

        {status === "expired" && (
          <>
            <h1 className="auth-title">Link expired</h1>
            <p className="auth-subtitle">
              Энэ verification холбоос буруу эсвэл хугацаа нь дууссан байна. Settings-ээс шинээр илгээх хүсэлт явуулна уу.
            </p>
            <Link href="/settings" className="auth-btn auth-btn--primary">
              Go to settings
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="auth-title">Verification failed</h1>
            <p className="auth-subtitle">{errorMsg ?? "Алдаа гарлаа."}</p>
            <Link href="/home" className="auth-btn auth-btn--primary">
              Back to home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
