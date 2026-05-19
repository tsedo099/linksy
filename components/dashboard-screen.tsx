"use client";

import { useLanguagePreferences } from "@/components/language-provider";
import { displayMediaSrc } from "@/lib/media";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const DASH_STRINGS = {
  en: {
    title: "Dashboard",
    subtitleDefault: "Your creator analytics at a glance",
    subtitleFmt: (followers: string, posts: string) => `${followers} followers · ${posts} posts`,
    loading: "Loading analytics…",
    loadError: "Could not load analytics.",
    statViews: "Post Views",
    statEngagement: "Engagement",
    statNewFollowers: "New Followers",
    statTotal: "Total Engagement",
    statDelta: "vs last period",
    chartTitle: "Views over time",
    chartLast: (range: "7d" | "30d" | "90d") =>
      range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days",
    chartEmpty: "No view data for this range yet.",
    topTitle: "Top performing posts",
    topEmpty: "You haven't posted in this range yet.",
    topUntitled: "Untitled post",
    topViews: "views",
    topLikes: "likes",
    breakdownTitle: "Engagement breakdown",
    breakdownEmpty: "No engagement yet in this range.",
  },
  mn: {
    title: "Удирдлагын самбар",
    subtitleDefault: "Бүтээгчийн тойм статистик",
    subtitleFmt: (followers: string, posts: string) => `${followers} дагагч · ${posts} пост`,
    loading: "Статистик ачаалж байна…",
    loadError: "Статистик ачаалж чадсангүй.",
    statViews: "Постын үзэлт",
    statEngagement: "Оролцоо",
    statNewFollowers: "Шинэ дагагч",
    statTotal: "Нийт оролцоо",
    statDelta: "өмнөх үетэй харьцуулахад",
    chartTitle: "Үзэлтийн динамик",
    chartLast: (range: "7d" | "30d" | "90d") =>
      range === "7d" ? "Сүүлийн 7 хоног" : range === "30d" ? "Сүүлийн 30 хоног" : "Сүүлийн 90 хоног",
    chartEmpty: "Энэ хугацааны үзэлтийн мэдээлэл алга.",
    topTitle: "Шилдэг постууд",
    topEmpty: "Энэ хугацаанд та пост нийтлээгүй байна.",
    topUntitled: "Нэргүй пост",
    topViews: "үзэлт",
    topLikes: "лайк",
    breakdownTitle: "Оролцооны задаргаа",
    breakdownEmpty: "Энэ хугацаанд оролцоо байхгүй.",
  },
};

const RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof RANGES)[number];

type DashboardStat = { value: number; deltaPercent: number };

type TopPost = {
  id: string;
  caption: string | null;
  mediaUrl: string | null;
  createdAt: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  engagement: number;
};

type EngagementBreakdown = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

type DashboardResponse = {
  range: Range;
  totals: { posts: number; followers: number };
  stats: {
    views: DashboardStat;
    engagementRate: DashboardStat;
    newFollowers: DashboardStat;
    engagement: DashboardStat;
  };
  chart: { date: string; label: string; views: number }[];
  topPosts: TopPost[];
  engagementBreakdown: EngagementBreakdown[];
};

const STAT_COLORS: Record<string, string> = {
  views: "#6366F1",
  engagementRate: "#22D3EE",
  newFollowers: "#34D399",
  engagement: "#F97316",
};

const BREAKDOWN_COLORS: Record<string, string> = {
  likes: "#6366F1",
  comments: "#EC4899",
  saves: "#34D399",
  reposts: "#22D3EE",
};

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="dash-bar-track">
      <div className="dash-bar-fill" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function DashboardScreen() {
  const { language } = useLanguagePreferences();
  const t = useMemo(() => (language === "mn" ? DASH_STRINGS.mn : DASH_STRINGS.en), [language]);
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/creator/dashboard?range=${range}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? t.loadError);
        }
        return res.json() as Promise<DashboardResponse>;
      })
      .then((payload) => {
        if (!alive) return;
        setData(payload);
      })
      .catch((err: Error) => {
        if (!alive) return;
        setError(err.message);
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range, t]);

  const stats = data
    ? [
        { key: "views", label: t.statViews, stat: data.stats.views, formatter: formatNumber },
        { key: "engagementRate", label: t.statEngagement, stat: data.stats.engagementRate, formatter: (v: number) => `${v.toFixed(1)}%` },
        { key: "newFollowers", label: t.statNewFollowers, stat: data.stats.newFollowers, formatter: formatNumber },
        { key: "engagement", label: t.statTotal, stat: data.stats.engagement, formatter: formatNumber },
      ]
    : [];

  const chartMax = data && data.chart.length > 0 ? Math.max(...data.chart.map((p) => p.views), 1) : 1;
  const topMaxViews = data && data.topPosts.length > 0 ? Math.max(...data.topPosts.map((p) => p.views), 1) : 1;

  return (
      <div className="dash-shell">
        <header className="dash-header">
          <div>
            <h1 className="dash-title">{t.title}</h1>
            <p className="dash-subtitle">
              {data
                ? t.subtitleFmt(formatNumber(data.totals.followers), formatNumber(data.totals.posts))
                : t.subtitleDefault}
            </p>
          </div>
          <div className="dash-range-group">
            {RANGES.map((r) => (
              <button
                key={r}
                className={`dash-range-btn${range === r ? " dash-range-btn--active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </header>

        {loading && (
          <p style={{ color: "var(--muted)", padding: "1rem 0" }}>{t.loading}</p>
        )}
        {error && !loading && (
          <p style={{ color: "#f87171", padding: "1rem 0" }}>{error}</p>
        )}

        {data && !loading && (
          <>
            <div className="dash-stats-grid">
              {stats.map((s) => {
                const up = s.stat.deltaPercent >= 0;
                const color = STAT_COLORS[s.key] ?? "#6366F1";
                return (
                  <div key={s.key} className="dash-stat-card" style={{ "--sc": color } as React.CSSProperties}>
                    <div className="dash-stat-bar" />
                    <p className="dash-stat-label">{s.label}</p>
                    <p className="dash-stat-value">{s.formatter(s.stat.value)}</p>
                    <span className={`dash-stat-delta${up ? " dash-stat-delta--up" : " dash-stat-delta--down"}`}>
                      {up ? "+" : ""}
                      {s.stat.deltaPercent}% {t.statDelta}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="dash-main-grid">
              {/* Chart */}
              <div className="dash-card dash-chart-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">{t.chartTitle}</span>
                  <span className="dash-card-sub">{t.chartLast(range)}</span>
                </div>
                <div className="dash-chart">
                  {data.chart.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{t.chartEmpty}</p>
                  ) : (
                    data.chart.map((point) => (
                      <div key={point.date} className="dash-chart-col" title={`${point.label}: ${point.views} ${t.topViews}`}>
                        <div className="dash-chart-bar-wrap">
                          <div
                            className="dash-chart-bar"
                            style={{ height: `${Math.max(2, (point.views / chartMax) * 100)}%` }}
                          />
                        </div>
                        <span className="dash-chart-label">{point.label}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top posts */}
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">{t.topTitle}</span>
                </div>
                <div className="dash-top-posts">
                  {data.topPosts.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{t.topEmpty}</p>
                  ) : (
                    data.topPosts.map((p) => {
                      const pct = (p.views / topMaxViews) * 100;
                      const thumb = p.mediaUrl ? displayMediaSrc(p.mediaUrl) ?? p.mediaUrl : null;
                      const title = p.caption?.trim().slice(0, 70) || t.topUntitled;
                      return (
                        <Link key={p.id} className="dash-top-row" href={`/post/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="dash-top-thumb" style={{ objectFit: "cover" }} />
                          ) : (
                            <div className="dash-top-thumb" style={{ background: "linear-gradient(135deg,#6366F1,#A855F7)" }} />
                          )}
                          <div className="dash-top-info">
                            <p className="dash-top-title">{title}</p>
                            <div className="dash-top-meta">
                              <span>{formatNumber(p.views)} {t.topViews}</span>
                              <span>·</span>
                              <span>{formatNumber(p.likes)} {t.topLikes}</span>
                            </div>
                            <MiniBar pct={pct} color="#6366F1" />
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Engagement breakdown */}
              <div className="dash-card">
                <div className="dash-card-header">
                  <span className="dash-card-title">{t.breakdownTitle}</span>
                </div>
                <div className="dash-engage-list">
                  {data.engagementBreakdown.length === 0 || data.engagementBreakdown.every((row) => row.count === 0) ? (
                    <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{t.breakdownEmpty}</p>
                  ) : (
                    data.engagementBreakdown.map((row) => (
                      <div key={row.key} className="dash-engage-row">
                        <span className="dash-engage-label">{row.label}</span>
                        <div className="dash-engage-bar-track">
                          <div
                            className="dash-engage-bar"
                            style={{ width: `${Math.max(2, row.percent)}%`, background: BREAKDOWN_COLORS[row.key] ?? "var(--app-accent)" }}
                          />
                        </div>
                        <span className="dash-engage-pct">{row.percent}%</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </>
        )}
      </div>
  );
}
