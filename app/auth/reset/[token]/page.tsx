"use client";

import Link from "next/link";
import { newPasswordIssue } from "@/lib/password-policy";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTokenValid(Boolean(d?.valid)))
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const pwdIssue = newPasswordIssue(password);
    if (pwdIssue) {
      setError(pwdIssue);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Reset failed.");
      setDone(true);
      setTimeout(() => router.push("/login"), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (validating) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-subtitle">Checking reset link...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Link expired</h1>
          <p className="auth-subtitle">
            Энэ reset холбоос буруу эсвэл хугацаа нь дууссан байна.
          </p>
          <Link href="/auth/forgot-password" className="auth-btn auth-btn--primary">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Password reset</h1>
          <p className="auth-subtitle">
            Нууц үг шинэчлэгдлээ. Дахин нэвтэрнэ үү...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Set new password</h1>
        <p className="auth-subtitle">Хүчтэй, шинэ нууц үг сонгоно уу.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
              placeholder="8+ chars: upper, lower, number & symbol"
              className="auth-input"
            />
          </label>

          <label className="auth-label">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="auth-input"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !password || !confirm}
            className="auth-btn auth-btn--primary"
          >
            {submitting ? "Resetting..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}
