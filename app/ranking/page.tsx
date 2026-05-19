"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { displayMediaSrc } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { userProfileHref } from "@/lib/user-url";

type Entry = {
  rank:        number;
  userId:      string;
  username:    string;
  displayName: string;
  avatarUrl:   string | null;
  xp:          number;
  level:       number;
  equippedBadge:  string | null;
  equippedBorder: string | null;
};

const MEDAL = ["🥇", "🥈", "🥉"];
const GRAD  = [
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#94a3b8,#64748b)",
  "linear-gradient(135deg,#b45309,#92400e)",
];

function RankRow({ entry }: { entry: Entry }) {
  const top3 = entry.rank <= 3;
  const init = entry.displayName.slice(0, 2).toUpperCase();

  return (
    <Link
      href={userProfileHref({ id: entry.userId, username: entry.username })}
      className={`rk-row${top3 ? ` rk-row--top${entry.rank}` : ""}`}
    >
      <span className="rk-rank">
        {top3 ? MEDAL[entry.rank - 1] : `#${entry.rank}`}
      </span>
      <div
        className="rk-avatar"
        style={
          top3
            ? (() => {
                const grad = GRAD[entry.rank - 1] ?? "";
                const headColor = (grad.split(",")[0] ?? "").replace("linear-gradient(135deg,", "");
                return { background: grad, boxShadow: `0 0 12px ${headColor}60` };
              })()
            : { background: "linear-gradient(135deg,#6366f1,#a855f7)" }
        }
      >
        {entry.avatarUrl ? (() => {
          const src = displayMediaSrc(entry.avatarUrl) ?? entry.avatarUrl;
          return <Image src={src} alt="" width={48} height={48} sizes="48px" className="rk-avatar-img" unoptimized={shouldUnoptimizeNextImageSrc(src)} />;
        })() : (
          <span>{init}</span>
        )}
      </div>
      <div className="rk-info">
        <p className="rk-name">
          {entry.displayName}
          {entry.equippedBadge && (
            <span className="rk-badge">{entry.equippedBadge}</span>
          )}
        </p>
        <p className="rk-handle">@{entry.username}</p>
      </div>
      <div className="rk-right">
        <span className="rk-level">LVL {entry.level}</span>
        <span className="rk-xp">{entry.xp.toLocaleString()} XP</span>
      </div>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className="rk-row rk-row--skel">
      <span className="rk-rank rk-skel rk-skel--sm" />
      <div className="rk-avatar rk-skel" />
      <div className="rk-info">
        <div className="rk-skel rk-skel--name" />
        <div className="rk-skel rk-skel--handle" />
      </div>
      <div className="rk-right">
        <div className="rk-skel rk-skel--sm" />
      </div>
    </div>
  );
}

export default function RankingPage() {
  const [board,   setBoard]   = useState<Entry[]>([]);
  const [myRank,  setMyRank]  = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ranking`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setBoard(d.board ?? []);
        setMyRank(d.myRank ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rk-page">
      <div className="rk-header">
        <h1 className="rk-title">LEADERBOARD</h1>
        <p className="rk-subtitle">WEEKLY RANKINGS</p>
      </div>

      {myRank && (
        <div className="rk-my-rank">
          <span className="rk-my-rank-label">YOUR RANK</span>
          <span className="rk-my-rank-val">#{myRank}</span>
        </div>
      )}

      <div className="rk-list">
        {loading
          ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
          : board.length === 0
            ? (
              <div className="rk-empty">
                <p>No creators ranked yet.</p>
                <p>Enable Creator Mode to earn XP!</p>
              </div>
            )
            : board.map((e) => <RankRow key={e.userId} entry={e} />)
        }
      </div>
    </div>
  );
}
