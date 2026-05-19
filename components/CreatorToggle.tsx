"use client";

import { useEffect, useState } from "react";

/* ── tiny inline SVG icons (same pattern as settings-screen) ── */
function Ic({ p, size = 16 }: { p: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
}
const IcZap      = () => <Ic p="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />;
const IcTrophy   = () => <Ic p="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M8 21h8M12 21v-4M7 4h10v6a5 5 0 0 1-10 0V4Z" />;
const IcStar     = () => <Ic p="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />;
const IcFile     = () => <Ic p="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6" />;
const IcMsg      = () => <Ic p="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
const IcLock     = () => <Ic p="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4" />;
const IcCheck    = () => <Ic p="M20 6 9 17l-5-5" size={13} />;
const IcGift     = () => <Ic p="M20 12v10H4V12M22 7H2v5h20V7ZM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />;
const IcChevron  = () => <Ic p="m9 18 6-6-6-6" size={14} />;

type Eligibility = {
  eligible: boolean;
  creatorMode: boolean;
  posts: number;
  interactions: number;
  postsGoal: number;
  interactionsGoal: number;
};

type XPData = {
  xp: number;
  level: number;
  progress: number;
  needed: number;
  subscriptionTier: string;
};

function ProgressBar({ pct, accent = false }: { pct: number; accent?: boolean }) {
  return (
    <div className="ct-bar-track">
      <div
        className={`ct-bar-fill${accent ? " ct-bar-fill--accent" : ""}`}
        style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }}
      />
    </div>
  );
}

export function CreatorToggle() {
  const [data, setData]           = useState<Eligibility | null>(null);
  const [xp, setXp]               = useState<XPData | null>(null);
  const [rank, setRank]           = useState<number | null>(null);
  const [loading, setLoading]     = useState(false);
  const [activated, setActivated] = useState(false);

  async function loadAll() {
    const [elig, xpd] = await Promise.all([
      fetch("/api/creator/eligibility").then((r) => r.ok ? r.json() : null),
      fetch("/api/user/xp").then((r) => r.ok ? r.json() : null),
    ]);
    if (elig) setData(elig as Eligibility);
    if (xpd)  setXp(xpd as XPData);
    if (elig?.creatorMode) {
      fetch("/api/ranking").then((r) => r.ok ? r.json() : null).then((d) => {
        if (d?.myRank != null) setRank(d.myRank);
      }).catch(() => {});
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!activated) return;
    const t = setTimeout(() => setActivated(false), 2800);
    return () => clearTimeout(t);
  }, [activated]);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/creator/toggle", { method: "POST" });
      const json = await res.json();
      if (!res.ok) return;
      const nowOn = json.creatorMode as boolean;
      setData((prev) => prev ? { ...prev, creatorMode: nowOn } : prev);
      if (nowOn) {
        setActivated(true);
        Promise.all([
          fetch("/api/user/xp").then((r) => r.ok ? r.json() : null),
          fetch("/api/ranking").then((r) => r.ok ? r.json() : null),
        ]).then(([xpd, rd]) => {
          if (xpd) setXp(xpd);
          if (rd?.myRank != null) setRank(rd.myRank);
        }).catch(() => {});
      } else {
        setRank(null);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return <div className="ct-skeleton" />;
  }

  const postPct  = Math.min(data.posts / data.postsGoal, 1);
  const interPct = Math.min(data.interactions / data.interactionsGoal, 1);
  const lockPct  = Math.round(Math.max(postPct, interPct) * 100);
  const xpPct    = xp && xp.needed > 0 ? Math.round((xp.progress / xp.needed) * 100) : 0;

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if (data.creatorMode) {
    return (
      <>
        <div className="ct-wrap ct-wrap--on">
          {activated && (
            <div className="ct-celebration">
              <span className="ct-cel-ic"><IcZap /></span>
              <span className="ct-cel-text">Creator Mode Activated!</span>
            </div>
          )}

          {/* Header */}
          <div className="ct-on-header">
            <div className="ct-on-label">
              <span className="ct-on-label-ic"><IcZap /></span>
              <span className="ct-on-label-txt">Creator Mode</span>
            </div>
            <button
              className="ct-tog ct-tog--on"
              onClick={toggle}
              disabled={loading}
              aria-pressed={true}
              aria-label="Disable creator mode"
            >
              <span className="ct-tog-dot" />
            </button>
          </div>

          {/* Glow avatar + stats */}
          <div className="ct-on-body">
            <div className="ct-glow-av">
              <IcZap />
            </div>
            <div className="ct-on-stats">
              <div className="ct-on-level-row">
                <span className="ct-on-level-num">Level {xp?.level ?? 0}</span>
                <span className="ct-on-xp-pill">{xp?.xp ?? 0} XP</span>
              </div>
              <ProgressBar pct={xpPct} accent />
              <div className="ct-on-progress-labels">
                <span>{xp?.progress ?? 0} / {(xp?.progress ?? 0) + (xp?.needed ?? 0)} XP</span>
                <span>{xpPct}%</span>
              </div>
              <div className="ct-on-next">
                {xp && xp.needed > 0
                  ? `Next: Level ${(xp.level ?? 0) + 1} — ${xp.needed - xp.progress} XP away`
                  : "Max level reached"}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="ct-stat-row">
            <div className="ct-stat-chip">
              <span className="ct-stat-ic"><IcTrophy /></span>
              <div className="ct-stat-body">
                <span className="ct-stat-val">{rank != null ? `#${rank}` : "—"}</span>
                <span className="ct-stat-lbl">Rank</span>
              </div>
            </div>
            <div className="ct-stat-divider" />
            <div className="ct-stat-chip">
              <span className="ct-stat-ic"><IcFile /></span>
              <div className="ct-stat-body">
                <span className="ct-stat-val">{data.posts}</span>
                <span className="ct-stat-lbl">Posts</span>
              </div>
            </div>
            <div className="ct-stat-divider" />
            <div className="ct-stat-chip">
              <span className="ct-stat-ic"><IcMsg /></span>
              <div className="ct-stat-body">
                <span className="ct-stat-val">{data.interactions}</span>
                <span className="ct-stat-lbl">Interactions</span>
              </div>
            </div>
          </div>
        </div>
        <style>{CT_STYLES}</style>
      </>
    );
  }

  // ── ELIGIBLE ──────────────────────────────────────────────────────────────
  if (data.eligible) {
    return (
      <>
        <div className="ct-wrap ct-wrap--ready">
          <div className="ct-ready-header">
            <div className="ct-ready-ic-wrap">
              <IcZap />
            </div>
            <div>
              <p className="ct-title">Ready to unlock</p>
              <p className="ct-title-sub">Turn on Creator Mode to start earning XP</p>
            </div>
          </div>

          {/* Achievement pills */}
          <div className="ct-achieve-row">
            {data.posts >= data.postsGoal && (
              <span className="ct-achieve-pill ct-achieve-pill--done">
                <IcCheck /> {data.posts} post{data.posts !== 1 ? "s" : ""}
              </span>
            )}
            {data.interactions >= data.interactionsGoal && (
              <span className="ct-achieve-pill ct-achieve-pill--done">
                <IcCheck /> {data.interactions} interactions
              </span>
            )}
          </div>

          <button className="ct-unlock-btn" onClick={toggle} disabled={loading}>
            {loading ? "Activating…" : "Turn on Creator Mode"}
          </button>
        </div>
        <style>{CT_STYLES}</style>
      </>
    );
  }

  // ── LOCKED ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="ct-wrap ct-wrap--locked">

        {/* Header */}
        <div className="ct-flame-header">
          <div className="ct-header-ic-wrap">
            <IcZap />
          </div>
          <div>
            <p className="ct-title">Become a Creator</p>
            <p className="ct-title-sub">Earn XP. Rank up. Unlock rewards.</p>
          </div>
        </div>

        {/* Progress */}
        <div className="ct-progress-section">
          <div className="ct-progress-label">
            <span>Progress</span>
            <span className="ct-progress-pct">{lockPct}%</span>
          </div>
          <ProgressBar pct={lockPct} />
        </div>

        {/* Checklist */}
        <div className="ct-checklist">
          <CheckItem done={data.posts >= data.postsGoal}
            label={`${data.posts} / ${data.postsGoal} posts`} />
          <span className="ct-or">or</span>
          <CheckItem done={data.interactions >= data.interactionsGoal}
            label={`${data.interactions} / ${data.interactionsGoal} interactions`} />
        </div>

        {/* Rewards */}
        <div className="ct-rewards">
          <div className="ct-rewards-title">
            <span className="ct-rewards-ic"><IcGift /></span>
            Unlock
          </div>
          <div className="ct-rewards-chips">
            <span className="ct-reward-chip">
              <IcStar /> XP system
            </span>
            <span className="ct-reward-chip">
              <IcFile /> Creator feed
            </span>
            <span className="ct-reward-chip">
              <IcTrophy /> Leaderboard
            </span>
          </div>
        </div>

        {/* Power preview */}
        <div className="ct-preview-card">
          <div className="ct-preview-glow-av">
            <IcZap />
          </div>
          <div className="ct-preview-body">
            <p className="ct-preview-level">Creator Level 1</p>
            <p className="ct-preview-sub">+10 XP per post · +2 XP per like</p>
            <div className="ct-preview-caret"><IcChevron /></div>
          </div>
        </div>

        <button className="ct-unlock-btn ct-unlock-btn--dim" disabled>
          <span className="ct-btn-ic"><IcLock /></span>
          Unlock Creator Mode
        </button>
      </div>
      <style>{CT_STYLES}</style>
    </>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`ct-check-item${done ? " ct-check-item--done" : ""}`}>
      <span className="ct-check-icon">
        {done ? <IcCheck /> : <span className="ct-check-circle" />}
      </span>
      <span>{label}</span>
    </div>
  );
}

const CT_STYLES = `
  .ct-skeleton {
    height: 80px;
    border-radius: 12px;
    background: var(--app-card-soft);
    animation: ct-pulse 1.4s ease-in-out infinite;
  }
  @keyframes ct-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }

  .ct-wrap {
    border-radius: 12px;
    padding: 1rem 1.1rem;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: .75rem;
  }
  .ct-wrap--on {
    background: var(--app-card);
    border: 1px solid rgba(var(--app-accent-rgb),.28);
  }
  .ct-wrap--ready {
    background: var(--app-card);
    border: 1px solid rgba(var(--app-accent-rgb),.28);
  }
  .ct-wrap--locked {
    background: var(--app-card);
    border: 1px solid var(--app-border);
  }

  /* ── Activation overlay ── */
  .ct-celebration {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center; gap: .5rem;
    background: var(--app-accent);
    border-radius: 12px; z-index: 6;
    animation: ct-fade-out 2.8s forwards;
  }
  @keyframes ct-fade-out {
    0%,70%{ opacity:1 }
    100%  { opacity:0; pointer-events:none }
  }
  .ct-cel-ic { color: #fff; display:flex; }
  .ct-cel-ic svg { width:20px; height:20px; }
  .ct-cel-text { font-size:.95rem; font-weight:700; color:#fff; }

  /* ── Active header ── */
  .ct-on-header {
    display: flex; align-items: center; justify-content: space-between;
  }
  .ct-on-label {
    display: flex; align-items: center; gap: .4rem;
    color: var(--app-accent);
  }
  .ct-on-label-ic { display:flex; }
  .ct-on-label-txt { font-size:.78rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }

  /* toggle */
  .ct-tog {
    position: relative; width:44px; height:26px;
    border:none; border-radius:999px;
    background: var(--app-border);
    cursor:pointer; padding:0; flex-shrink:0;
    transition: background .2s;
  }
  .ct-tog--on { background: var(--app-accent); }
  .ct-tog-dot {
    position:absolute; top:3px; left:3px;
    width:20px; height:20px; border-radius:50%;
    background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2);
    transition: transform .2s;
  }
  .ct-tog--on .ct-tog-dot { transform:translateX(18px); }

  /* glow avatar + stats */
  .ct-on-body { display:flex; align-items:center; gap:.9rem; }
  .ct-glow-av {
    flex-shrink:0; width:52px; height:52px;
    border-radius:14px;
    background: linear-gradient(135deg, var(--app-accent), rgba(var(--app-accent-rgb),.5));
    display:flex; align-items:center; justify-content:center;
    color:#fff;
    box-shadow: 0 0 0 3px rgba(var(--app-accent-rgb),.18),
                0 0 16px 4px rgba(var(--app-accent-rgb),.4);
    animation: ct-glow 2.6s ease-in-out infinite;
  }
  .ct-glow-av svg { width:22px; height:22px; }
  @keyframes ct-glow {
    0%,100%{ box-shadow: 0 0 0 3px rgba(var(--app-accent-rgb),.18), 0 0 16px 4px rgba(var(--app-accent-rgb),.4); }
    50%    { box-shadow: 0 0 0 4px rgba(var(--app-accent-rgb),.3),  0 0 26px 8px rgba(var(--app-accent-rgb),.6); }
  }
  .ct-on-stats { flex:1; display:flex; flex-direction:column; gap:.28rem; min-width:0; }
  .ct-on-level-row { display:flex; align-items:center; gap:.45rem; }
  .ct-on-level-num { font-size:.96rem; font-weight:800; color:var(--text); }
  .ct-on-xp-pill {
    font-size:.68rem; font-weight:700; color:var(--app-accent);
    background:rgba(var(--app-accent-rgb),.1);
    padding:.1rem .42rem; border-radius:999px;
  }
  .ct-on-progress-labels {
    display:flex; justify-content:space-between;
    font-size:.64rem; color:var(--muted); margin-top:.08rem;
  }
  .ct-on-next { font-size:.71rem; color:var(--muted); }

  /* stats row */
  .ct-stat-row {
    display:flex; align-items:center; justify-content:space-around;
    padding:.6rem .4rem;
    border-radius:8px;
    background:var(--app-card-soft);
    border:1px solid var(--app-border);
  }
  .ct-stat-chip { display:flex; align-items:center; gap:.38rem; flex:1; justify-content:center; }
  .ct-stat-ic { color:var(--muted); display:flex; }
  .ct-stat-body { display:flex; flex-direction:column; gap:.02rem; }
  .ct-stat-val { font-size:.88rem; font-weight:700; color:var(--text); line-height:1; }
  .ct-stat-lbl { font-size:.6rem; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  .ct-stat-divider { width:1px; height:26px; background:var(--app-border); flex-shrink:0; }

  /* ── Progress bar ── */
  .ct-bar-track {
    height:7px; border-radius:999px;
    background:var(--app-card-soft); overflow:hidden;
  }
  .ct-bar-fill {
    height:100%; border-radius:999px;
    background:var(--muted); transition:width .45s ease;
  }
  .ct-bar-fill--accent {
    background: linear-gradient(90deg, var(--app-accent), rgba(var(--app-accent-rgb),.6));
  }

  /* ── Locked / Eligible shared header ── */
  .ct-flame-header { display:flex; align-items:flex-start; gap:.55rem; }
  .ct-header-ic-wrap {
    flex-shrink:0; width:34px; height:34px;
    border-radius:9px;
    background:rgba(var(--app-accent-rgb),.1);
    border:1px solid rgba(var(--app-accent-rgb),.18);
    display:flex; align-items:center; justify-content:center;
    color:var(--app-accent);
  }
  .ct-title { margin:0; font-size:.95rem; font-weight:700; color:var(--text); }
  .ct-title-sub { margin:.1rem 0 0; font-size:.73rem; color:var(--muted); }

  /* ── Progress section ── */
  .ct-progress-section { display:flex; flex-direction:column; gap:.3rem; }
  .ct-progress-label {
    display:flex; justify-content:space-between;
    font-size:.68rem; font-weight:600; text-transform:uppercase;
    letter-spacing:.05em; color:var(--muted);
  }
  .ct-progress-pct { color:var(--text); }

  /* ── Checklist ── */
  .ct-checklist { display:flex; flex-direction:column; gap:.24rem; }
  .ct-check-item { display:flex; align-items:center; gap:.5rem; font-size:.83rem; color:var(--muted); }
  .ct-check-item--done { color:var(--text); }
  .ct-check-icon { width:16px; display:flex; align-items:center; justify-content:center; color:var(--muted); }
  .ct-check-item--done .ct-check-icon { color:var(--app-accent); }
  .ct-check-circle {
    display:block; width:10px; height:10px; border-radius:50%;
    border:1.5px solid var(--app-border);
  }
  .ct-or {
    font-size:.66rem; font-weight:700; text-transform:uppercase;
    letter-spacing:.06em; color:var(--muted); padding-left:24px;
  }

  /* ── Rewards ── */
  .ct-rewards { display:flex; flex-direction:column; gap:.3rem; }
  .ct-rewards-title {
    display:flex; align-items:center; gap:.35rem;
    font-size:.78rem; font-weight:700; color:var(--text);
  }
  .ct-rewards-ic { display:flex; color:var(--muted); }
  .ct-rewards-chips { display:flex; flex-wrap:wrap; gap:.3rem; }
  .ct-reward-chip {
    display:flex; align-items:center; gap:.3rem;
    font-size:.72rem; font-weight:600; color:var(--muted);
    background:var(--app-card-soft);
    padding:.22rem .55rem; border-radius:999px;
    border:1px solid var(--app-border);
  }
  .ct-reward-chip svg { width:12px; height:12px; }

  /* ── Preview card ── */
  .ct-preview-card {
    display:flex; align-items:center; gap:.7rem;
    padding:.65rem .85rem; border-radius:9px;
    background:rgba(var(--app-accent-rgb),.06);
    border:1px solid rgba(var(--app-accent-rgb),.18);
  }
  .ct-preview-glow-av {
    flex-shrink:0; width:36px; height:36px; border-radius:9px;
    background:linear-gradient(135deg, var(--app-accent), rgba(var(--app-accent-rgb),.5));
    display:flex; align-items:center; justify-content:center;
    color:#fff; box-shadow:0 0 10px 2px rgba(var(--app-accent-rgb),.3);
  }
  .ct-preview-glow-av svg { width:16px; height:16px; }
  .ct-preview-body { flex:1; display:flex; flex-direction:column; gap:.1rem; }
  .ct-preview-level { margin:0; font-size:.82rem; font-weight:700; color:var(--text); }
  .ct-preview-sub   { margin:0; font-size:.71rem; color:var(--muted); }
  .ct-preview-caret { display:flex; color:var(--muted); margin-top:.05rem; }

  /* ── Eligible state ── */
  .ct-ready-header { display:flex; align-items:flex-start; gap:.55rem; }
  .ct-ready-ic-wrap {
    flex-shrink:0; width:34px; height:34px; border-radius:9px;
    background:rgba(var(--app-accent-rgb),.1);
    border:1px solid rgba(var(--app-accent-rgb),.18);
    display:flex; align-items:center; justify-content:center;
    color:var(--app-accent);
  }
  .ct-achieve-row { display:flex; flex-wrap:wrap; gap:.35rem; }
  .ct-achieve-pill {
    display:flex; align-items:center; gap:.3rem;
    font-size:.74rem; font-weight:600;
    padding:.22rem .55rem; border-radius:999px;
    background:var(--app-card-soft); color:var(--muted);
    border:1px solid var(--app-border);
  }
  .ct-achieve-pill svg { width:11px; height:11px; }
  .ct-achieve-pill--done {
    background:rgba(var(--app-accent-rgb),.1);
    color:var(--app-accent);
    border-color:rgba(var(--app-accent-rgb),.25);
  }

  /* ── Buttons ── */
  .ct-unlock-btn {
    width:100%; padding:.72rem 1rem;
    display:flex; align-items:center; justify-content:center; gap:.4rem;
    border:none; border-radius:9px;
    background:var(--app-accent); color:#fff;
    font-size:.87rem; font-weight:700;
    cursor:pointer; font-family:inherit;
    transition:opacity .15s, transform .15s;
  }
  .ct-unlock-btn:hover:not(:disabled){ opacity:.87; transform:translateY(-1px); }
  .ct-unlock-btn:disabled { cursor:not-allowed; opacity:.65; }
  .ct-unlock-btn--dim { background:var(--app-card-soft); color:var(--muted); }
  .ct-btn-ic { display:flex; }
  .ct-btn-ic svg { width:14px; height:14px; }

  /* Phone refinements + touch targets. */
  @media (max-width: 480px) {
    .ct-shell { padding: 1rem 0.9rem; }
    .ct-title { font-size: 1.05rem; }
    .ct-sub { font-size: 0.84rem; }
    .ct-progress-row { gap: 0.4rem; }
  }
  @media (pointer: coarse) {
    .ct-unlock-btn { min-height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ct-unlock-btn { transition: none !important; }
    .ct-unlock-btn:hover { transform: none !important; }
  }
`;
