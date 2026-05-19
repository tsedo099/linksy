"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UiButton } from "@/components/ui/button";

type OAuthAuthorizeData = {
  application: {
    name: string;
    description: string | null;
    homepageUrl: string | null;
  };
  scopes: string[];
  request: Record<string, string>;
};

export default function OAuthAuthorizePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(() => searchParams.toString(), [searchParams]);
  const [data, setData] = useState<OAuthAuthorizeData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/oauth/authorize?${query}`)
      .then((res) => res.ok ? res.json() : res.json().then((body) => Promise.reject(new Error(body?.error ?? "Invalid OAuth request."))))
      .then((body: OAuthAuthorizeData) => {
        if (alive) setData(body);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Invalid OAuth request.");
      });
    return () => {
      alive = false;
    };
  }, [query]);

  async function decide(action: "approve" | "deny") {
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(searchParams.entries());
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.redirectTo) throw new Error(body?.error ?? "Could not complete OAuth request.");
      window.location.href = body.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete OAuth request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="login-panel" style={{ margin: "auto" }}>
        <div className="login-card">
          <div className="login-copy">
            <h2>Authorize application</h2>
            {data ? (
              <p className="login-subcopy">
                {data.application.name} wants access to your Linksy account.
              </p>
            ) : null}
          </div>
          {error ? <p className="status-banner">{error}</p> : null}
          {!error && !data ? <p className="login-subcopy">Loading OAuth request...</p> : null}
          {data ? (
            <>
              <div className="login-form">
                {data.scopes.map((scope) => (
                  <div key={scope} className="field-group">
                    <strong>{scope}</strong>
                  </div>
                ))}
              </div>
              <UiButton type="button" onClick={() => decide("approve")} disabled={busy}>
                {busy ? "Authorizing..." : "Authorize"}
              </UiButton>
              <button type="button" className="ghost-link" onClick={() => decide("deny")} disabled={busy}>
                Deny
              </button>
            </>
          ) : null}
          <button type="button" className="ghost-link" onClick={() => router.push("/settings")}>
            Back to settings
          </button>
        </div>
      </section>
    </main>
  );
}
