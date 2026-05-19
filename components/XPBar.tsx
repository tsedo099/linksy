"use client";

import { useEffect, useState } from "react";

type XPData = {
  creatorMode:      boolean;
  xp:               number;
  level:            number;
  progress:         number;
  needed:           number;
  subscriptionTier: string;
};

const TIER_COLOR: Record<string, string> = {
  FREE: "#8b5cf6",
  PRO:  "#f59e0b",
};

export function XPBar({ compact = false }: { compact?: boolean }) {
  const [data, setData]       = useState<XPData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/xp")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!data)   return null;

  if (!data.creatorMode) {
    return null;
  }

  const accent = TIER_COLOR[data.subscriptionTier] ?? "#8b5cf6";
  const pct    = Math.min(100, Math.round((data.progress / data.needed) * 100));

  if (compact) {
    return (
      <div className="xpbar-compact">
        <span className="xpbar-level" style={{ color: accent }}>LVL {data.level}</span>
        <div className="xpbar-track">
          <div className="xpbar-fill" style={{ width: `${pct}%`, background: accent }} />
        </div>
        <span className="xpbar-xp">{data.xp.toLocaleString()} XP</span>
      </div>
    );
  }

  return (
    <div className="xpbar-full">
      <div className="xpbar-header">
        <span className="xpbar-label">
          <span className="xpbar-level-badge" style={{ background: accent }}>LVL {data.level}</span>
          <span className="xpbar-tier">{data.subscriptionTier}</span>
        </span>
        <span className="xpbar-nums">{data.progress.toLocaleString()} / {data.needed.toLocaleString()} XP</span>
      </div>
      <div className="xpbar-track">
        <div className="xpbar-fill" style={{ width: `${pct}%`, background: accent }} />
      </div>
      <p className="xpbar-hint">
        {pct < 100
          ? `${(data.needed - data.progress).toLocaleString()} XP until Level ${data.level + 1}`
          : "Level up ready!"}
      </p>
    </div>
  );
}
