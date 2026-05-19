"use client";

import { useEffect, useState } from "react";

type AuthorizedApp = {
  applicationId: string;
  scopes: string[];
  authorizedAt: string;
  updatedAt: string;
  liveTokens: number;
  application: {
    id: string;
    name: string;
    description: string | null;
    homepageUrl: string | null;
    revokedByOwner: boolean;
    owner: { username: string; displayName: string } | null;
  };
};

export function ConnectedAppsScreen() {
  const [apps, setApps] = useState<AuthorizedApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/oauth/authorized", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((data) => {
        if (alive) setApps(data.apps ?? []);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Could not load connected apps.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function revoke(applicationId: string, appName: string) {
    if (!window.confirm(`Revoke ${appName}'s access? Tokens issued to this app will stop working immediately.`)) {
      return;
    }
    setRevoking(applicationId);
    try {
      const res = await fetch(
        `/api/oauth/authorized/${encodeURIComponent(applicationId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      setApps((cur) => (cur ?? []).filter((a) => a.applicationId !== applicationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setRevoking(null);
    }
  }

  return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.2rem 4rem" }}>
        <header style={{ marginBottom: "1.2rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.45rem" }}>Connected apps</h1>
          <p style={{ margin: ".35rem 0 0", color: "var(--muted)", fontSize: ".9rem" }}>
            Third-party apps you have granted access to your Linksy account. Revoke any you no
            longer use — their tokens stop working immediately.
          </p>
        </header>

        {error ? (
          <div
            role="alert"
            style={{
              padding: ".7rem .85rem",
              border: "1px solid rgba(239,68,68,.4)",
              background: "rgba(239,68,68,.1)",
              color: "#fca5a5",
              borderRadius: 10,
              marginBottom: "1rem",
              fontSize: ".88rem",
            }}
          >
            {error}
          </div>
        ) : null}

        {apps === null ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : apps.length === 0 ? (
          <div
            style={{
              padding: "1.4rem",
              borderRadius: 14,
              border: "1px dashed var(--app-border)",
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            No apps have access to your account yet.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: ".85rem" }}>
            {apps.map((app) => {
              const isBusy = revoking === app.applicationId;
              return (
                <li
                  key={app.applicationId}
                  style={{
                    padding: "1rem 1.15rem",
                    borderRadius: 14,
                    background: "var(--app-card)",
                    border: "1px solid var(--app-border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        {app.application.name}
                        {app.application.revokedByOwner ? (
                          <span style={{ marginLeft: ".5rem", color: "#fbbf24", fontSize: ".7rem", fontWeight: 800, letterSpacing: ".05em" }}>
                            DISABLED BY OWNER
                          </span>
                        ) : null}
                      </p>
                      {app.application.owner ? (
                        <p style={{ margin: ".15rem 0 0", color: "var(--muted)", fontSize: ".78rem" }}>
                          by {app.application.owner.displayName} <span style={{ opacity: .7 }}>@{app.application.owner.username}</span>
                        </p>
                      ) : null}
                      {app.application.description ? (
                        <p style={{ margin: ".45rem 0 0", color: "var(--muted)", fontSize: ".85rem", lineHeight: 1.45 }}>
                          {app.application.description}
                        </p>
                      ) : null}
                      <p style={{ margin: ".55rem 0 0", color: "var(--muted)", fontSize: ".78rem" }}>
                        Authorized {new Date(app.authorizedAt).toLocaleDateString()} ·{" "}
                        {app.liveTokens > 0 ? `${app.liveTokens} active token${app.liveTokens === 1 ? "" : "s"}` : "no active tokens"}
                      </p>
                      {app.scopes.length > 0 ? (
                        <div style={{ marginTop: ".5rem", display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
                          {app.scopes.map((scope) => (
                            <code
                              key={scope}
                              style={{
                                padding: ".15rem .55rem",
                                borderRadius: 999,
                                background: "var(--app-card-soft, rgba(124,58,237,.12))",
                                color: "var(--app-accent, #c4b5fd)",
                                fontSize: ".7rem",
                              }}
                            >
                              {scope}
                            </code>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(app.applicationId, app.application.name)}
                      disabled={isBusy}
                      style={{
                        padding: ".55rem .9rem",
                        borderRadius: 10,
                        border: "1px solid rgba(239,68,68,.4)",
                        background: "rgba(239,68,68,.1)",
                        color: "#fca5a5",
                        fontWeight: 700,
                        cursor: isBusy ? "wait" : "pointer",
                      }}
                    >
                      {isBusy ? "Revoking…" : "Revoke"}
                    </button>
                  </div>
                  {app.application.homepageUrl ? (
                    <a
                      href={app.application.homepageUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: ".55rem", color: "var(--app-accent)", fontSize: ".8rem" }}
                    >
                      {app.application.homepageUrl}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
  );
}
