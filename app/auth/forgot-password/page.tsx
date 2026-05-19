"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Request failed.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Forgot password</h1>
        <p className="auth-subtitle">
          Имэйл хаягаа оруулна уу. Хэрэв акаунт байвал reset холбоос илгээх болно.
        </p>

        {submitted ? (
          <div className="auth-success">
            <p>Хэрэв энэ имэйл бүртгэлтэй бол reset холбоос илгээгдсэн. Inbox-оо шалгана уу.</p>
            <Link href="/login" className="auth-btn auth-btn--primary">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="auth-input"
              />
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email}
              className="auth-btn auth-btn--primary"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>

            <Link href="/login" className="auth-link">
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
