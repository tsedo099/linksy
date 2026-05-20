"use client";

import { AppShell } from "@/components/app-shell";
import { useLanguagePreferences } from "@/components/language-provider";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";

type Tab = "overview" | "safety" | "users" | "reports" | "verifications" | "feedback" | "audit" | "deletions";

type AdminWarning = {
  id: string;
  kind: string;
  severity: string;
  score: number;
  reason: string;
  excerpt: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    banActive: boolean;
    banUntil: string | null;
  };
};

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  banActive: boolean;
  banUntil: string | null;
  activeWarnings: number;
  totalWarnings: number;
  lastWarningAt: string | null;
  postCount: number;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  suspensionActive: boolean;
};

type AdminReport = {
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; username: string; displayName: string; avatarUrl: string | null };
  target:
    | { kind: "user"; user: { id: string; username: string; displayName: string; suspendedUntil: string | null } | null }
    | { kind: "post"; post: { id: string; caption: string | null; mediaUrls: string[]; createdAt: string; author: { id: string; username: string; displayName: string } } | null }
    | { kind: "other"; raw: string };
};

type AdminVerification = {
  id: string;
  userId: string;
  category: string;
  reason: string;
  supportingUrls: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
  decidedBy: { id: string; username: string; displayName: string } | null;
};

type AdminFeedback = {
  id: string;
  userId: string;
  category: "BUG" | "FEATURE_REQUEST" | "PRAISE" | "COMPLAINT" | "OTHER";
  message: string;
  contextUrl: string | null;
  userAgent: string | null;
  appVersion: string | null;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CLOSED";
  createdAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
};

type AuditLog = {
  id: string;
  action: string;
  actor: { id: string; username?: string; displayName?: string } | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: string;
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: "#7cecff",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  CRITICAL: "#ef4444",
};

const STRINGS = {
  en: {
    title: "Admin Dashboard",
    subtitle: "Central control for moderation, users, and audit history.",
    tabOverview: "Overview",
    tabSafety: "Safe Social",
    tabUsers: "Users",
    tabAudit: "Audit log",
    tabDeletions: "Deletion queue",
    accessDenied: "You are not an admin. Set SAFETY_ADMIN_USER_IDS in env to enable.",
    loading: "Loading…",
    failed: "Action failed",
    empty: "Nothing to show.",
    loadMore: "Load more",
    filterUser: "Filter by user ID",
    filterAction: "Filter by action prefix (e.g. safety.)",
    search: "Search users by name, @username, or email",
    apply: "Apply",
    clear: "Clear",
    confirmDelete: "Delete this warning?",
    confirmUnban: "Lift this ban and reset their warning count?",
    deleteWarning: "Delete",
    unban: "Lift ban",
    banned: "BANNED",
    overviewWarnings: "Recent warnings",
    overviewBans: "Active bans",
    overviewTotal: "Total warnings",
    overviewWindow: "Last 30 days",
    rolePill: "Admin",
    noActor: "(system)",
    when: "When",
    actor: "Actor",
    action: "Action",
    target: "Target",
    details: "Details",
    activeWarnings: "Active",
    totalWarnings: "All time",
    posts: "Posts",
    joined: "Joined",
    viewUser: "View",
    delHeading: "Pending account deletions",
    delIntro: (days: number) =>
      `Users have ${days} days to cancel after requesting deletion. The cron job purges them once the timer hits zero.`,
    delEmpty: "No pending deletion requests.",
    delRequested: "Requested",
    delPurge: "Purges",
    delIn: "in",
    delOverdue: "Overdue — next cron run will purge.",
    delPosts: "posts",
    delFollowers: "followers",
    delCancel: "Cancel deletion",
    tabReports: "Reports",
    tabVerifications: "Verifications",
    tabFeedback: "Feedback",
    reportsEmpty: "No reports awaiting triage.",
    reportsResolve: "Resolve",
    reportsDismiss: "Dismiss",
    reportsReopen: "Reopen",
    reportsTargetUser: "user",
    reportsTargetPost: "post",
    reportsReportedBy: "Reported by",
    reportsReason: "Reason",
    reportsDetails: "Details",
    reportsBulkSelectedFmt: (n: number) => `${n} post${n === 1 ? "" : "s"} selected`,
    reportsBulkDelete: "Delete selected posts",
    reportsBulkDeleting: "Deleting…",
    reportsBulkClear: "Clear selection",
    reportsBulkConfirmFmt: (n: number) =>
      `Permanently delete ${n} post${n === 1 ? "" : "s"} and resolve the linked reports? This cannot be undone.`,
    reportsBulkResultFmt: (deleted: number, notFound: number) =>
      `Deleted ${deleted} post${deleted === 1 ? "" : "s"}${notFound > 0 ? `, ${notFound} already gone` : ""}.`,
    verificationsEmpty: "No verification requests.",
    verificationsApprove: "Approve",
    verificationsReject: "Reject",
    verificationsCategory: "Category",
    verificationsReason: "Reason",
    verificationsSupporting: "Supporting links",
    verificationsSubmitted: "Submitted",
    verificationsApproved: "Approved",
    verificationsRejected: "Rejected",
    verificationsAlreadyVerified: "Already verified",
    feedbackEmpty: "No feedback to triage.",
    feedbackOpen: "Open",
    feedbackAcknowledged: "Acknowledged",
    feedbackResolved: "Resolved",
    feedbackClosed: "Closed",
    feedbackSetAck: "Mark acknowledged",
    feedbackSetResolved: "Mark resolved",
    feedbackSetClosed: "Mark closed",
    feedbackReopen: "Reopen",
    feedbackContext: "Context",
    suspended: "SUSPENDED",
    suspend: "Suspend",
    unsuspend: "Lift suspension",
    suspendTitle: "Suspend account",
    suspendDescription: "User will be signed out and prevented from signing in until the suspension expires.",
    suspendDays: "Days (1-365)",
    suspendReason: "Reason (shown to the user)",
    suspendApply: "Apply suspension",
    suspendCancel: "Cancel",
    suspendUntil: "Suspended until",
    statusFilter: "Status",
    statusAll: "All",
    statusPending: "Pending",
    statusOpen: "Open",
  },
  mn: {
    title: "Админ удирдлага",
    subtitle: "Модерац, хэрэглэгч, аудит лог-ийн нэгдсэн самбар.",
    tabOverview: "Тоймтэй",
    tabSafety: "Safe Social",
    tabUsers: "Хэрэглэгчид",
    tabAudit: "Аудит лог",
    tabDeletions: "Устгал хүсэлт",
    accessDenied: "Та админ биш байна. SAFETY_ADMIN_USER_IDS env-д ID нэмнэ үү.",
    loading: "Ачааллаж байна…",
    failed: "Алдаа",
    empty: "Харуулах юм алга.",
    loadMore: "Цааш үзэх",
    filterUser: "Хэрэглэгчийн ID-р шүүх",
    filterAction: "Үйлдлийн нэрээр шүүх (ж: safety.)",
    search: "Хэрэглэгч нэр, @username, мэйлээр хайх",
    apply: "Шүүх",
    clear: "Цэвэрлэх",
    confirmDelete: "Энэ анхааруулгыг устгах уу?",
    confirmUnban: "Ban-г буцааж, warning-уудыг 0 болгох уу?",
    deleteWarning: "Устгах",
    unban: "Сэргээх",
    banned: "BAN",
    overviewWarnings: "Сүүлийн анхааруулга",
    overviewBans: "Идэвхтэй ban",
    overviewTotal: "Нийт анхааруулга",
    overviewWindow: "Сүүлийн 30 хоног",
    rolePill: "Админ",
    noActor: "(систем)",
    when: "Хэзээ",
    actor: "Үйлдэгч",
    action: "Үйлдэл",
    target: "Зорилт",
    details: "Дэлгэрэнгүй",
    activeWarnings: "Идэвхтэй",
    totalWarnings: "Нийт",
    posts: "Пост",
    joined: "Бүртгэсэн",
    viewUser: "Үзэх",
    delHeading: "Хүлээгдэж буй устгал хүсэлт",
    delIntro: (days: number) =>
      `Хэрэглэгч устгал хүссэний дараа ${days} хоног буцаах боломжтой. Тэр хугацааны дараа cron автоматаар арилгана.`,
    delEmpty: "Устгах хүсэлт байхгүй.",
    delRequested: "Хүссэн",
    delPurge: "Арилгах",
    delIn: "дараа",
    delOverdue: "Хугацаа дууссан — дараагийн cron ажиллахад арилгана.",
    delPosts: "пост",
    delFollowers: "дагагч",
    delCancel: "Цуцлах",
    tabReports: "Гомдол",
    tabVerifications: "Баталгаажуулалт",
    tabFeedback: "Санал хүсэлт",
    reportsEmpty: "Хүлээгдэж буй гомдол алга.",
    reportsResolve: "Шийдэх",
    reportsDismiss: "Татгалзах",
    reportsReopen: "Дахин нээх",
    reportsTargetUser: "хэрэглэгч",
    reportsTargetPost: "пост",
    reportsReportedBy: "Мэдээлсэн",
    reportsReason: "Шалтгаан",
    reportsDetails: "Дэлгэрэнгүй",
    reportsBulkSelectedFmt: (n: number) => `${n} пост сонгосон`,
    reportsBulkDelete: "Сонгосон постуудыг устгах",
    reportsBulkDeleting: "Устгаж байна…",
    reportsBulkClear: "Сонголтыг арилгах",
    reportsBulkConfirmFmt: (n: number) =>
      `${n} постыг бүрмөсөн устгаад холбогдох гомдлыг шийдэх үү? Буцаах боломжгүй.`,
    reportsBulkResultFmt: (deleted: number, notFound: number) =>
      `${deleted} пост устгасан${notFound > 0 ? `, ${notFound} аль хэдийн алга` : ""}.`,
    verificationsEmpty: "Баталгаажуулах хүсэлт алга.",
    verificationsApprove: "Зөвшөөрөх",
    verificationsReject: "Татгалзах",
    verificationsCategory: "Ангилал",
    verificationsReason: "Шалтгаан",
    verificationsSupporting: "Нотлох холбоос",
    verificationsSubmitted: "Хүсэлт гаргасан",
    verificationsApproved: "Зөвшөөрсөн",
    verificationsRejected: "Татгалзсан",
    verificationsAlreadyVerified: "Аль хэдийн баталгаажсан",
    feedbackEmpty: "Шинэ санал хүсэлт алга.",
    feedbackOpen: "Нээлттэй",
    feedbackAcknowledged: "Хүлээн авсан",
    feedbackResolved: "Шийдэгдсэн",
    feedbackClosed: "Хаасан",
    feedbackSetAck: "Хүлээн авсан гэж тэмдэглэх",
    feedbackSetResolved: "Шийдсэн гэж тэмдэглэх",
    feedbackSetClosed: "Хаах",
    feedbackReopen: "Дахин нээх",
    feedbackContext: "Контекст",
    suspended: "ТҮДГЭЛЗҮҮЛСЭН",
    suspend: "Түдгэлзүүлэх",
    unsuspend: "Сэргээх",
    suspendTitle: "Хэрэглэгчийг түдгэлзүүлэх",
    suspendDescription: "Энэ хэрэглэгч системээс гарч, түдгэлзүүлэх хугацаа дуустал нэвтэрч чадахгүй.",
    suspendDays: "Хоног (1-365)",
    suspendReason: "Шалтгаан (хэрэглэгчид харагдана)",
    suspendApply: "Түдгэлзүүлэх",
    suspendCancel: "Цуцлах",
    suspendUntil: "Түдгэлзүүлсэн хугацаа",
    statusFilter: "Төлөв",
    statusAll: "Бүгд",
    statusPending: "Хүлээгдэж буй",
    statusOpen: "Нээлттэй",
  },
};

export function AdminPanelScreen() {
  const router = useRouter();
  const { language } = useLanguagePreferences();
  const t = language === "mn" ? STRINGS.mn : STRINGS.en;
  const confirm = useConfirm();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (!data?.user) {
          router.replace("/login");
          return;
        }
        setAuthorized(Boolean(data.user.isAdmin));
      })
      .catch(() => alive && setAuthorized(false));
    return () => {
      alive = false;
    };
  }, [router]);

  if (authorized === null) {
    return (
      <AppShell>
        <div className="ap-page"><div className="ap-loading">{t.loading}</div></div>
        {pageStyles}
      </AppShell>
    );
  }
  if (!authorized) {
    return (
      <AppShell>
        <div className="ap-page">
          <div className="ap-card ap-card--alert">{t.accessDenied}</div>
        </div>
        {pageStyles}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="ap-page">
        <header className="ap-hero">
          <div className="ap-hero-badge" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="ap-hero-title">{t.title}</h1>
            <p className="ap-hero-sub">{t.subtitle}</p>
          </div>
        </header>

        <nav className="ap-tabs" role="tablist" aria-label="Admin sections">
          {(["overview", "reports", "verifications", "feedback", "safety", "users", "audit", "deletions"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`ap-tab${tab === key ? " ap-tab--on" : ""}`}
              onClick={() => setTab(key)}
            >
              {key === "overview" ? t.tabOverview
                : key === "reports" ? t.tabReports
                : key === "verifications" ? t.tabVerifications
                : key === "feedback" ? t.tabFeedback
                : key === "safety" ? t.tabSafety
                : key === "users" ? t.tabUsers
                : key === "audit" ? t.tabAudit
                : t.tabDeletions}
            </button>
          ))}
        </nav>

        {tab === "overview" ? <OverviewPanel t={t} onJumpTo={setTab} /> : null}
        {tab === "reports" ? <ReportsPanel t={t} /> : null}
        {tab === "verifications" ? <VerificationsPanel t={t} /> : null}
        {tab === "feedback" ? <FeedbackPanel t={t} /> : null}
        {tab === "safety" ? <SafetyPanel t={t} /> : null}
        {tab === "users" ? <UsersPanel t={t} /> : null}
        {tab === "audit" ? <AuditPanel t={t} /> : null}
        {tab === "deletions" ? <DeletionsPanel t={t} /> : null}
      </div>
      {pageStyles}
    </AppShell>
  );
}

/* ── Overview ── */
function OverviewPanel({
  t,
  onJumpTo,
}: {
  t: typeof STRINGS.en;
  onJumpTo: (tab: Tab) => void;
}) {
  const [stats, setStats] = useState<{ warnings: number; bans: number; recent: AdminWarning[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/safety/warnings?limit=10", { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const warnings: AdminWarning[] = data.warnings ?? [];
        const bans = new Set(warnings.filter((w) => w.user.banActive).map((w) => w.user.id)).size;
        if (alive) setStats({ warnings: warnings.length, bans, recent: warnings });
      } catch {
        if (alive) setStats({ warnings: 0, bans: 0, recent: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="ap-card">
      <div className="ap-stat-grid">
        <button type="button" className="ap-stat" onClick={() => onJumpTo("safety")}>
          <span className="ap-stat-label">{t.overviewWarnings}</span>
          <span className="ap-stat-value">{loading ? "…" : stats?.warnings ?? 0}</span>
          <span className="ap-stat-note">{t.overviewWindow}</span>
        </button>
        <button type="button" className="ap-stat" onClick={() => onJumpTo("safety")}>
          <span className="ap-stat-label">{t.overviewBans}</span>
          <span className="ap-stat-value">{loading ? "…" : stats?.bans ?? 0}</span>
          <span className="ap-stat-note">{t.overviewWindow}</span>
        </button>
        <button type="button" className="ap-stat" onClick={() => onJumpTo("audit")}>
          <span className="ap-stat-label">{t.tabAudit}</span>
          <span className="ap-stat-value">→</span>
          <span className="ap-stat-note">{t.tabAudit}</span>
        </button>
      </div>

      <h3 className="ap-section-title">{t.overviewWarnings}</h3>
      {loading ? (
        <p className="ap-loading">{t.loading}</p>
      ) : stats && stats.recent.length > 0 ? (
        <ul className="ap-mini-list">
          {stats.recent.slice(0, 5).map((w) => (
            <li key={w.id} className="ap-mini">
              <span className="ap-warning-kind" style={{ color: SEVERITY_COLOR[w.severity] ?? "var(--app-text)" }}>
                {w.kind}
              </span>
              <span className="ap-mini-user">@{w.user.username}</span>
              <span className="ap-mini-reason">{w.reason}</span>
              <span className="ap-mini-time">{new Date(w.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ap-empty">{t.empty}</p>
      )}
    </section>
  );
}

/* ── Safety ── */
function SafetyPanel({ t }: { t: typeof STRINGS.en }) {
  const [warnings, setWarnings] = useState<AdminWarning[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userFilter, setUserFilter] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (applied) params.set("userId", applied);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      try {
        const res = await fetch(`/api/admin/safety/warnings?${params.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        setWarnings((cur) => (cursor ? [...cur, ...data.warnings] : data.warnings));
        setNextCursor(data.nextCursor ?? null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [applied],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminWarning[]>();
    for (const w of warnings) {
      const list = map.get(w.user.id) ?? [];
      list.push(w);
      map.set(w.user.id, list);
    }
    return Array.from(map.entries());
  }, [warnings]);

  const deleteWarning = async (id: string) => {
    if (!(await confirm(t.confirmDelete))) return;
    setBusy(`del-${id}`);
    try {
      const res = await fetch(`/api/admin/safety/warnings/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      setWarnings((cur) => cur.filter((w) => w.id !== id));
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const unban = async (userId: string) => {
    if (!(await confirm(t.confirmUnban))) return;
    const reason = window.prompt("Reason (optional)") ?? undefined;
    setBusy(`unban-${userId}`);
    try {
      const res = await fetch(`/api/admin/safety/users/${userId}/unban`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setWarnings((cur) =>
        cur.map((w) =>
          w.user.id === userId ? { ...w, user: { ...w.user, banActive: false, banUntil: null } } : w,
        ),
      );
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="ap-card">
        <form
          className="ap-filter"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(userFilter.trim());
          }}
        >
          <input
            className="ap-filter-input"
            placeholder={t.filterUser}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />
          <button type="submit" className="ap-btn">{t.apply}</button>
          {applied ? (
            <button
              type="button"
              className="ap-btn ap-btn--ghost"
              onClick={() => {
                setUserFilter("");
                setApplied("");
              }}
            >
              {t.clear}
            </button>
          ) : null}
        </form>
        {error ? <p className="ap-error">{error}</p> : null}
      </section>

      <section className="ap-card">
        {loading && warnings.length === 0 ? (
          <p className="ap-loading">{t.loading}</p>
        ) : grouped.length === 0 ? (
          <p className="ap-empty">{t.empty}</p>
        ) : (
          <ul className="ap-user-list">
            {grouped.map(([userId, items]) => {
              const user = items[0]!.user;
              return (
                <li key={userId} className="ap-user">
                  <div className="ap-user-head">
                    <div>
                      <p className="ap-user-name">
                        {user.displayName}
                        <span className="ap-user-handle">@{user.username}</span>
                      </p>
                      <p className="ap-user-meta">{items.length} warnings · ID: <code>{user.id}</code></p>
                    </div>
                    <div className="ap-user-actions">
                      {user.banActive ? (
                        <>
                          <span className="ap-pill ap-pill--bad">{t.banned}</span>
                          <button
                            type="button"
                            className="ap-btn ap-btn--success"
                            disabled={busy === `unban-${user.id}`}
                            onClick={() => unban(user.id)}
                          >
                            {busy === `unban-${user.id}` ? t.loading : t.unban}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <ul className="ap-warning-list">
                    {items.map((w) => (
                      <li key={w.id} className="ap-warning">
                        <div className="ap-warning-head">
                          <span className="ap-warning-kind" style={{ color: SEVERITY_COLOR[w.severity] ?? "var(--app-text)" }}>
                            {w.kind} · {w.severity}
                          </span>
                          <span className="ap-warning-time">{new Date(w.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="ap-warning-reason">{w.reason}</p>
                        {w.excerpt ? <p className="ap-warning-excerpt">&ldquo;{w.excerpt}&rdquo;</p> : null}
                        <div className="ap-warning-actions">
                          <button
                            type="button"
                            className="ap-btn ap-btn--ghost ap-btn--sm"
                            disabled={busy === `del-${w.id}`}
                            onClick={() => deleteWarning(w.id)}
                          >
                            {busy === `del-${w.id}` ? t.loading : t.deleteWarning}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
        {nextCursor ? (
          <button
            type="button"
            className="ap-btn ap-load-more"
            onClick={() => load(nextCursor)}
            disabled={loading}
          >
            {loading ? t.loading : t.loadMore}
          </button>
        ) : null}
      </section>
    </>
  );
}

/* ── Users ── */
function UsersPanel({ t }: { t: typeof STRINGS.en }) {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendModalUser, setSuspendModalUser] = useState<AdminUser | null>(null);
  const [suspendDays, setSuspendDays] = useState("7");
  const [suspendReason, setSuspendReason] = useState("");

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (applied) params.set("q", applied);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "25");
      try {
        const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        setUsers((cur) => (cursor ? [...cur, ...data.users] : data.users));
        setNextCursor(data.nextCursor ?? null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [applied],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const unban = async (userId: string) => {
    if (!(await confirm(t.confirmUnban))) return;
    setBusy(`unban-${userId}`);
    try {
      const res = await fetch(`/api/admin/safety/users/${userId}/unban`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setUsers((cur) =>
        cur.map((u) => (u.id === userId ? { ...u, banActive: false, banUntil: null, activeWarnings: 0 } : u)),
      );
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const applySuspend = async () => {
    if (!suspendModalUser) return;
    const days = Number.parseInt(suspendDays, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) return;
    if (!suspendReason.trim()) return;
    setBusy(`suspend-${suspendModalUser.id}`);
    try {
      const res = await fetch(`/api/admin/users/${suspendModalUser.id}/suspend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, reason: suspendReason.trim() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setUsers((cur) =>
        cur.map((u) =>
          u.id === suspendModalUser.id
            ? { ...u, suspendedUntil: data.suspendedUntil, suspendedReason: data.reason, suspensionActive: true }
            : u,
        ),
      );
      setSuspendModalUser(null);
      setSuspendDays("7");
      setSuspendReason("");
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const unsuspend = async (userId: string) => {
    setBusy(`unsuspend-${userId}`);
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setUsers((cur) =>
        cur.map((u) =>
          u.id === userId ? { ...u, suspendedUntil: null, suspensionActive: false } : u,
        ),
      );
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="ap-card">
        <form
          className="ap-filter"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(q.trim());
          }}
        >
          <input
            className="ap-filter-input"
            placeholder={t.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="ap-btn">{t.apply}</button>
          {applied ? (
            <button
              type="button"
              className="ap-btn ap-btn--ghost"
              onClick={() => {
                setQ("");
                setApplied("");
              }}
            >
              {t.clear}
            </button>
          ) : null}
        </form>
        {error ? <p className="ap-error">{error}</p> : null}
      </section>

      <section className="ap-card">
        {loading && users.length === 0 ? (
          <p className="ap-loading">{t.loading}</p>
        ) : users.length === 0 ? (
          <p className="ap-empty">{t.empty}</p>
        ) : (
          <table className="ap-table">
            <thead>
              <tr>
                <th>User</th>
                <th>{t.activeWarnings}</th>
                <th>{t.totalWarnings}</th>
                <th>{t.posts}</th>
                <th>{t.joined}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="ap-user-cell">
                      <strong>{u.displayName}</strong>
                      <span className="ap-user-handle">@{u.username}</span>
                      <span className="ap-user-meta">{u.email}</span>
                    </div>
                  </td>
                  <td>{u.activeWarnings}</td>
                  <td>{u.totalWarnings}</td>
                  <td>{u.postCount}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="ap-row-actions">
                    {u.banActive ? (
                      <>
                        <span className="ap-pill ap-pill--bad">{t.banned}</span>
                        <button
                          type="button"
                          className="ap-btn ap-btn--success ap-btn--sm"
                          disabled={busy === `unban-${u.id}`}
                          onClick={() => unban(u.id)}
                        >
                          {busy === `unban-${u.id}` ? t.loading : t.unban}
                        </button>
                      </>
                    ) : null}
                    {u.suspensionActive ? (
                      <>
                        <span className="ap-pill ap-pill--bad" title={u.suspendedReason ?? ""}>{t.suspended}</span>
                        <button
                          type="button"
                          className="ap-btn ap-btn--success ap-btn--sm"
                          disabled={busy === `unsuspend-${u.id}`}
                          onClick={() => unsuspend(u.id)}
                        >
                          {busy === `unsuspend-${u.id}` ? t.loading : t.unsuspend}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ap-btn ap-btn--ghost ap-btn--sm"
                        onClick={() => {
                          setSuspendModalUser(u);
                          setSuspendDays("7");
                          setSuspendReason("");
                        }}
                      >
                        {t.suspend}
                      </button>
                    )}
                    <a
                      className="ap-btn ap-btn--ghost ap-btn--sm"
                      href={`/${encodeURIComponent(u.username)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.viewUser}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {nextCursor ? (
          <button
            type="button"
            className="ap-btn ap-load-more"
            onClick={() => load(nextCursor)}
            disabled={loading}
          >
            {loading ? t.loading : t.loadMore}
          </button>
        ) : null}
      </section>

      {suspendModalUser ? (
        <div className="ap-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSuspendModalUser(null)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="ap-modal-title">{t.suspendTitle}</h3>
            <p className="ap-modal-sub">
              <strong>{suspendModalUser.displayName}</strong> <span className="ap-user-handle">@{suspendModalUser.username}</span>
            </p>
            <p className="ap-modal-desc">{t.suspendDescription}</p>
            <label className="ap-field">
              <span>{t.suspendDays}</span>
              <input
                type="number"
                min={1}
                max={365}
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
              />
            </label>
            <label className="ap-field">
              <span>{t.suspendReason}</span>
              <textarea
                rows={3}
                value={suspendReason}
                maxLength={500}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </label>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn--ghost" onClick={() => setSuspendModalUser(null)}>
                {t.suspendCancel}
              </button>
              <button
                type="button"
                className="ap-btn ap-btn--danger"
                disabled={
                  busy === `suspend-${suspendModalUser.id}` ||
                  !suspendReason.trim() ||
                  !Number.parseInt(suspendDays, 10)
                }
                onClick={applySuspend}
              >
                {busy === `suspend-${suspendModalUser.id}` ? t.loading : t.suspendApply}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── Audit log ── */
function AuditPanel({ t }: { t: typeof STRINGS.en }) {
  const [actionFilter, setActionFilter] = useState("");
  const [applied, setApplied] = useState("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (applied) params.set("action", applied);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      try {
        const res = await fetch(`/api/admin/audit-log?${params.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        setLogs((cur) => (cursor ? [...cur, ...data.logs] : data.logs));
        setNextCursor(data.nextCursor ?? null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [applied],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  return (
    <>
      <section className="ap-card">
        <form
          className="ap-filter"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(actionFilter.trim());
          }}
        >
          <input
            className="ap-filter-input"
            placeholder={t.filterAction}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <button type="submit" className="ap-btn">{t.apply}</button>
          {applied ? (
            <button
              type="button"
              className="ap-btn ap-btn--ghost"
              onClick={() => {
                setActionFilter("");
                setApplied("");
              }}
            >
              {t.clear}
            </button>
          ) : null}
        </form>
        {error ? <p className="ap-error">{error}</p> : null}
      </section>

      <section className="ap-card">
        {loading && logs.length === 0 ? (
          <p className="ap-loading">{t.loading}</p>
        ) : logs.length === 0 ? (
          <p className="ap-empty">{t.empty}</p>
        ) : (
          <table className="ap-table">
            <thead>
              <tr>
                <th>{t.when}</th>
                <th>{t.action}</th>
                <th>{t.actor}</th>
                <th>{t.target}</th>
                <th>{t.details}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="ap-cell-mono">{new Date(l.createdAt).toLocaleString()}</td>
                  <td><code>{l.action}</code></td>
                  <td>
                    {l.actor ? (
                      <span>
                        <strong>{l.actor.displayName ?? l.actor.id}</strong>
                        {l.actor.username ? <span className="ap-user-handle">@{l.actor.username}</span> : null}
                      </span>
                    ) : (
                      <span className="ap-user-meta">{t.noActor}</span>
                    )}
                  </td>
                  <td>
                    {l.targetType ? (
                      <span>
                        {l.targetType}
                        {l.targetId ? <span className="ap-user-meta"> · {l.targetId}</span> : null}
                      </span>
                    ) : (
                      <span className="ap-user-meta">—</span>
                    )}
                  </td>
                  <td>
                    {l.metadata ? (
                      <details>
                        <summary className="ap-summary">JSON</summary>
                        <pre className="ap-pre">{JSON.stringify(l.metadata, null, 2)}</pre>
                      </details>
                    ) : (
                      <span className="ap-user-meta">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {nextCursor ? (
          <button
            type="button"
            className="ap-btn ap-load-more"
            onClick={() => load(nextCursor)}
            disabled={loading}
          >
            {loading ? t.loading : t.loadMore}
          </button>
        ) : null}
      </section>
    </>
  );
}

/* ── Deletion queue ── */
type DeletionRequest = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  accountCreatedAt: string;
  requestedAt: string;
  purgeAt: string;
  remainingMs: number;
  overdue: boolean;
  postCount: number;
  followerCount: number;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function DeletionsPanel({ t }: { t: typeof STRINGS.en }) {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [graceDays, setGraceDays] = useState(30);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cancelDeletion = async (userId: string) => {
    setBusy(userId);
    try {
      const res = await fetch("/api/admin/deletion-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "cancel" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setRequests((cur) => cur.filter((r) => r.id !== userId));
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const load = useCallback(async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      const res = await fetch(`/api/admin/deletion-requests?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setGraceDays(data.graceDays ?? 30);
      setRequests((cur) => (cursor ? [...cur, ...data.requests] : data.requests));
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  return (
    <section className="ap-card">
      <h3 className="ap-section-title">{t.delHeading}</h3>
      <p style={{ color: "var(--app-text-muted)", margin: "0 0 1rem", fontSize: ".88rem" }}>
        {t.delIntro(graceDays)}
      </p>
      {error ? <p className="ap-error">{error}</p> : null}
      {loading && requests.length === 0 ? (
        <p className="ap-loading">{t.loading}</p>
      ) : requests.length === 0 ? (
        <p className="ap-empty">{t.delEmpty}</p>
      ) : (
        <ul className="ap-user-list">
          {requests.map((req) => (
            <li key={req.id} className="ap-user">
              <div className="ap-user-head">
                <div>
                  <p className="ap-user-name">
                    {req.displayName}
                    <span className="ap-user-handle">@{req.username}</span>
                  </p>
                  <p className="ap-user-meta">
                    {req.email} · {req.postCount} {t.delPosts} · {req.followerCount} {t.delFollowers}
                  </p>
                  <p className="ap-user-meta">
                    {t.delRequested}: {new Date(req.requestedAt).toLocaleString()}
                  </p>
                  <p className="ap-user-meta">
                    {req.overdue ? (
                      <span style={{ color: "#fca5a5", fontWeight: 700 }}>{t.delOverdue}</span>
                    ) : (
                      <>
                        {t.delPurge}: {new Date(req.purgeAt).toLocaleString()} ({t.delIn} {formatRemaining(req.remainingMs)})
                      </>
                    )}
                  </p>
                </div>
                <div className="ap-row-actions">
                  <button
                    type="button"
                    className="ap-btn ap-btn--success ap-btn--sm"
                    disabled={busy === req.id}
                    onClick={() => cancelDeletion(req.id)}
                    title="Cancel pending deletion — restores the account immediately."
                  >
                    {busy === req.id ? t.loading : t.delCancel}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button
          type="button"
          className="ap-btn ap-load-more"
          onClick={() => load(nextCursor)}
          disabled={loading}
        >
          {loading ? t.loading : t.loadMore}
        </button>
      ) : null}
    </section>
  );
}

/* ── Reports triage ── */
function ReportsPanel({ t }: { t: typeof STRINGS.en }) {
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "DISMISSED" | "ALL">("OPEN");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Multi-select: only POST-target reports are selectable (the bulk-delete API
  // operates on post IDs). The Set key is the same report key the per-row code
  // uses below — keeps lookup O(1) and avoids stale references when `reports`
  // mutates after a transition.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports?status=${status}&limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  // Clear selection whenever the filter changes — the rows underneath get
  // replaced and a stale Set would dangle.
  useEffect(() => {
    setSelected(new Set());
  }, [status]);

  const toggleSelected = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (bulkBusy || selected.size === 0) return;
    // Collect (reportKey, postId) pairs for selected POST-target reports.
    const selectedReports = reports.filter((r) => {
      if (r.target.kind !== "post" || !("post" in r.target) || !r.target.post) return false;
      const key = `${r.reporterId}:${r.targetType}:${r.targetId}`;
      return selected.has(key);
    });

    const postIds = Array.from(
      new Set(
        selectedReports
          .map((r) => (r.target.kind === "post" && "post" in r.target ? r.target.post?.id : null))
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (postIds.length === 0) return;

    const confirmed = await confirm(t.reportsBulkConfirmFmt(postIds.length));
    if (!confirmed) return;

    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/posts/bulk-delete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds, reason: "Bulk delete from reports queue" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json().catch(() => null)) as
        | { deleted: number; notFound: string[] }
        | null;

      // Resolve the underlying reports so they leave the OPEN queue. Best-effort
      // — if one PATCH fails the post is already gone, so we keep going.
      await Promise.allSettled(
        selectedReports.map((r) =>
          fetch("/api/admin/reports", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reporterId: r.reporterId,
              targetType: r.targetType,
              targetId: r.targetId,
              status: "RESOLVED",
            }),
          }),
        ),
      );

      const deleted = data?.deleted ?? postIds.length;
      const notFound = data?.notFound?.length ?? 0;
      // eslint-disable-next-line no-alert
      window.alert(t.reportsBulkResultFmt(deleted, notFound));

      setSelected(new Set());
      void load();
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const transition = async (r: AdminReport, next: "OPEN" | "RESOLVED" | "DISMISSED") => {
    const key = `${r.reporterId}:${r.targetType}:${r.targetId}`;
    setBusy(key);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterId: r.reporterId, targetType: r.targetType, targetId: r.targetId, status: next }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // Re-load so the filter stays consistent.
      void load();
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="ap-card">
        <div className="ap-filter">
          <label className="ap-filter-label">
            <span>{t.statusFilter}</span>
            <select className="ap-filter-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="OPEN">{t.statusOpen}</option>
              <option value="RESOLVED">{t.tabReports + " — " + t.reportsResolve}</option>
              <option value="DISMISSED">{t.tabReports + " — " + t.reportsDismiss}</option>
              <option value="ALL">{t.statusAll}</option>
            </select>
          </label>
        </div>
        {error ? <p className="ap-error">{error}</p> : null}
      </section>

      {selected.size > 0 ? (
        <section className="ap-card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.9rem", position: "sticky", top: 0, zIndex: 4 }}>
          <span style={{ fontWeight: 600 }}>{t.reportsBulkSelectedFmt(selected.size)}</span>
          <button
            type="button"
            className="ap-btn ap-btn--danger ap-btn--sm"
            disabled={bulkBusy}
            onClick={() => void bulkDelete()}
          >
            {bulkBusy ? t.reportsBulkDeleting : t.reportsBulkDelete}
          </button>
          <button
            type="button"
            className="ap-btn ap-btn--ghost ap-btn--sm"
            disabled={bulkBusy}
            onClick={() => setSelected(new Set())}
          >
            {t.reportsBulkClear}
          </button>
        </section>
      ) : null}

      <section className="ap-card">
        {loading ? (
          <p className="ap-loading">{t.loading}</p>
        ) : reports.length === 0 ? (
          <p className="ap-empty">{t.reportsEmpty}</p>
        ) : (
          <ul className="ap-feed-list">
            {reports.map((r) => {
              const key = `${r.reporterId}:${r.targetType}:${r.targetId}`;
              const isOpen = r.status === "OPEN";
              const isPostReport = r.target.kind === "post" && "post" in r.target && Boolean(r.target.post);
              const isSelected = selected.has(key);
              return (
                <li key={key} className="ap-feed-item">
                  <div className="ap-feed-head">
                    {isPostReport && isOpen ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(key)}
                        aria-label={`Select report ${key}`}
                        style={{ marginRight: "0.4rem" }}
                      />
                    ) : null}
                    <span className={`ap-pill ${isOpen ? "ap-pill--warn" : "ap-pill--neutral"}`}>{r.status}</span>
                    <span className="ap-feed-target">
                      {(() => {
                        if (r.target.kind === "user" && "user" in r.target && r.target.user) {
                          return <>↳ {t.reportsTargetUser}: <a href={`/${encodeURIComponent(r.target.user.username)}`} target="_blank" rel="noreferrer">@{r.target.user.username}</a></>;
                        }
                        if (r.target.kind === "post" && "post" in r.target && r.target.post) {
                          return <>↳ {t.reportsTargetPost}: <a href={`/post/${r.target.post.id}`} target="_blank" rel="noreferrer">@{r.target.post.author.username}</a></>;
                        }
                        return <>↳ {r.target.kind}</>;
                      })()}
                    </span>
                    <span className="ap-feed-time">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="ap-feed-body">
                    <p><strong>{t.reportsReportedBy}:</strong> @{r.reporter.username}</p>
                    <p><strong>{t.reportsReason}:</strong> {r.reason}</p>
                    {r.details ? <p><strong>{t.reportsDetails}:</strong> {r.details}</p> : null}
                    {r.target.kind === "post" && "post" in r.target && r.target.post?.caption ? (
                      <blockquote className="ap-feed-quote">{r.target.post.caption}</blockquote>
                    ) : null}
                  </div>
                  <div className="ap-feed-actions">
                    {isOpen ? (
                      <>
                        <button type="button" className="ap-btn ap-btn--success ap-btn--sm" disabled={busy === key} onClick={() => transition(r, "RESOLVED")}>
                          {t.reportsResolve}
                        </button>
                        <button type="button" className="ap-btn ap-btn--ghost ap-btn--sm" disabled={busy === key} onClick={() => transition(r, "DISMISSED")}>
                          {t.reportsDismiss}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="ap-btn ap-btn--ghost ap-btn--sm" disabled={busy === key} onClick={() => transition(r, "OPEN")}>
                        {t.reportsReopen}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/* ── Verifications review ── */
function VerificationsPanel({ t }: { t: typeof STRINGS.en }) {
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [items, setItems] = useState<AdminVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verifications?status=${status}&limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setItems(data.requests ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED", decisionNote: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/verifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, note: decisionNote || undefined }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setNoteFor(null);
      setNote("");
      void load();
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="ap-card">
        <div className="ap-filter">
          <label className="ap-filter-label">
            <span>{t.statusFilter}</span>
            <select className="ap-filter-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="PENDING">{t.statusPending}</option>
              <option value="APPROVED">{t.verificationsApproved}</option>
              <option value="REJECTED">{t.verificationsRejected}</option>
              <option value="ALL">{t.statusAll}</option>
            </select>
          </label>
        </div>
        {error ? <p className="ap-error">{error}</p> : null}
      </section>

      <section className="ap-card">
        {loading ? (
          <p className="ap-loading">{t.loading}</p>
        ) : items.length === 0 ? (
          <p className="ap-empty">{t.verificationsEmpty}</p>
        ) : (
          <ul className="ap-feed-list">
            {items.map((v) => {
              const isPending = v.status === "PENDING";
              return (
                <li key={v.id} className="ap-feed-item">
                  <div className="ap-feed-head">
                    <span className={`ap-pill ${v.status === "PENDING" ? "ap-pill--warn" : v.status === "APPROVED" ? "ap-pill--good" : "ap-pill--neutral"}`}>{v.status}</span>
                    <span className="ap-feed-target">
                      <a href={`/${encodeURIComponent(v.user.username)}`} target="_blank" rel="noreferrer">@{v.user.username}</a>
                      {v.user.isVerified ? <em style={{ marginLeft: 6, opacity: 0.7 }}>· {t.verificationsAlreadyVerified}</em> : null}
                    </span>
                    <span className="ap-feed-time">{new Date(v.submittedAt).toLocaleString()}</span>
                  </div>
                  <div className="ap-feed-body">
                    <p><strong>{t.verificationsCategory}:</strong> {v.category}</p>
                    <p><strong>{t.verificationsReason}:</strong> {v.reason}</p>
                    {v.supportingUrls.length > 0 ? (
                      <p><strong>{t.verificationsSupporting}:</strong>{" "}
                        {v.supportingUrls.map((u, i) => (
                          <a key={i} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{u}</a>
                        ))}
                      </p>
                    ) : null}
                    {v.decisionNote ? <p style={{ opacity: 0.8 }}><em>“{v.decisionNote}”</em> — @{v.decidedBy?.username ?? "?"}</p> : null}
                  </div>
                  {isPending ? (
                    <div className="ap-feed-actions">
                      <button type="button" className="ap-btn ap-btn--success ap-btn--sm" disabled={busy === v.id} onClick={() => setNoteFor({ id: v.id, decision: "APPROVED" })}>
                        {t.verificationsApprove}
                      </button>
                      <button type="button" className="ap-btn ap-btn--danger ap-btn--sm" disabled={busy === v.id} onClick={() => setNoteFor({ id: v.id, decision: "REJECTED" })}>
                        {t.verificationsReject}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {noteFor ? (
        <div className="ap-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setNoteFor(null)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="ap-modal-title">{noteFor.decision === "APPROVED" ? t.verificationsApprove : t.verificationsReject}</h3>
            <label className="ap-field">
              <span>{t.verificationsReason} (optional)</span>
              <textarea rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn--ghost" onClick={() => setNoteFor(null)}>{t.suspendCancel}</button>
              <button
                type="button"
                className={`ap-btn ${noteFor.decision === "APPROVED" ? "ap-btn--success" : "ap-btn--danger"}`}
                disabled={busy === noteFor.id}
                onClick={() => decide(noteFor.id, noteFor.decision, note)}
              >
                {busy === noteFor.id ? t.loading : (noteFor.decision === "APPROVED" ? t.verificationsApprove : t.verificationsReject)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── Feedback inbox ── */
function FeedbackPanel({ t }: { t: typeof STRINGS.en }) {
  const [status, setStatus] = useState<"OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CLOSED" | "ALL">("OPEN");
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feedback?status=${status}&limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setItems(data.feedback ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const transition = async (id: string, next: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CLOSED") => {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      void load();
    } catch (e) {
      setError(`${t.failed}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = (s: AdminFeedback["status"]) =>
    s === "OPEN" ? t.feedbackOpen : s === "ACKNOWLEDGED" ? t.feedbackAcknowledged : s === "RESOLVED" ? t.feedbackResolved : t.feedbackClosed;

  return (
    <>
      <section className="ap-card">
        <div className="ap-filter">
          <label className="ap-filter-label">
            <span>{t.statusFilter}</span>
            <select className="ap-filter-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="OPEN">{t.feedbackOpen}</option>
              <option value="ACKNOWLEDGED">{t.feedbackAcknowledged}</option>
              <option value="RESOLVED">{t.feedbackResolved}</option>
              <option value="CLOSED">{t.feedbackClosed}</option>
              <option value="ALL">{t.statusAll}</option>
            </select>
          </label>
        </div>
        {error ? <p className="ap-error">{error}</p> : null}
      </section>

      <section className="ap-card">
        {loading ? (
          <p className="ap-loading">{t.loading}</p>
        ) : items.length === 0 ? (
          <p className="ap-empty">{t.feedbackEmpty}</p>
        ) : (
          <ul className="ap-feed-list">
            {items.map((f) => (
              <li key={f.id} className="ap-feed-item">
                <div className="ap-feed-head">
                  <span className={`ap-pill ${f.status === "OPEN" ? "ap-pill--warn" : f.status === "RESOLVED" ? "ap-pill--good" : "ap-pill--neutral"}`}>
                    {statusLabel(f.status)}
                  </span>
                  <span className="ap-pill ap-pill--neutral" style={{ marginLeft: 6 }}>{f.category}</span>
                  <span className="ap-feed-target">
                    <a href={`/${encodeURIComponent(f.user.username)}`} target="_blank" rel="noreferrer">@{f.user.username}</a>
                  </span>
                  <span className="ap-feed-time">{new Date(f.createdAt).toLocaleString()}</span>
                </div>
                <div className="ap-feed-body">
                  <blockquote className="ap-feed-quote">{f.message}</blockquote>
                  {f.contextUrl ? <p style={{ opacity: 0.8 }}><strong>{t.feedbackContext}:</strong> {f.contextUrl}</p> : null}
                </div>
                <div className="ap-feed-actions">
                  {f.status !== "ACKNOWLEDGED" && f.status !== "CLOSED" ? (
                    <button type="button" className="ap-btn ap-btn--ghost ap-btn--sm" disabled={busy === f.id} onClick={() => transition(f.id, "ACKNOWLEDGED")}>
                      {t.feedbackSetAck}
                    </button>
                  ) : null}
                  {f.status !== "RESOLVED" ? (
                    <button type="button" className="ap-btn ap-btn--success ap-btn--sm" disabled={busy === f.id} onClick={() => transition(f.id, "RESOLVED")}>
                      {t.feedbackSetResolved}
                    </button>
                  ) : null}
                  {f.status !== "CLOSED" ? (
                    <button type="button" className="ap-btn ap-btn--ghost ap-btn--sm" disabled={busy === f.id} onClick={() => transition(f.id, "CLOSED")}>
                      {t.feedbackSetClosed}
                    </button>
                  ) : (
                    <button type="button" className="ap-btn ap-btn--ghost ap-btn--sm" disabled={busy === f.id} onClick={() => transition(f.id, "OPEN")}>
                      {t.feedbackReopen}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

const pageStyles = (
  <style jsx global>{`
    .ap-page {
      max-width: 1080px;
      margin: 0 auto;
      padding: 2rem 1.2rem 4rem;
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
      color: var(--app-text);
    }
    .ap-hero {
      display: flex; gap: 1rem; align-items: center;
      padding: 1.4rem 1.5rem;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(124, 236, 255, 0.08), rgba(168, 140, 255, 0.10));
      border: 1px solid var(--app-border);
    }
    .ap-hero-badge {
      display: grid; place-items: center;
      width: 44px; height: 44px;
      border-radius: 14px;
      background: rgba(124, 236, 255, 0.16);
      color: var(--app-accent, #7cecff);
    }
    .ap-hero-title { margin: 0; font-size: 1.35rem; font-weight: 700; }
    .ap-hero-sub { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.9rem; }

    .ap-tabs {
      display: flex; gap: .3rem; padding: .35rem;
      background: var(--app-card-soft);
      border: 1px solid var(--app-border);
      border-radius: 14px;
      overflow-x: auto;
    }
    .ap-tab {
      flex: 1;
      min-width: 100px;
      padding: .55rem .85rem;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font: inherit;
      font-weight: 700;
      border-radius: 10px;
      cursor: pointer;
      white-space: nowrap;
    }
    .ap-tab:hover { color: var(--app-text); }
    .ap-tab--on {
      background: var(--app-card);
      color: var(--app-text);
      box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
    }

    .ap-card {
      padding: 1.2rem 1.3rem;
      border-radius: 16px;
      background: var(--app-card);
      border: 1px solid var(--app-border);
    }
    .ap-card--alert {
      border-color: rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.08);
      color: #fecaca;
    }

    .ap-stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: .85rem;
      margin-bottom: 1.2rem;
    }
    .ap-stat {
      display: flex;
      flex-direction: column;
      gap: .35rem;
      padding: .9rem 1rem;
      border-radius: 12px;
      background: var(--app-card-soft);
      border: 1px solid var(--app-border);
      cursor: pointer;
      color: inherit;
      text-align: left;
      font: inherit;
      transition: transform 160ms ease, border-color 160ms ease;
    }
    .ap-stat:hover { transform: translateY(-1px); border-color: var(--app-accent); }
    .ap-stat-label {
      font-size: .7rem; text-transform: uppercase; letter-spacing: .05em;
      color: var(--app-text-muted); font-weight: 700;
    }
    .ap-stat-value { font-size: 1.6rem; font-weight: 800; }
    .ap-stat-note { font-size: .74rem; color: var(--app-text-muted); }

    .ap-section-title { margin: 0 0 .7rem; font-size: .95rem; font-weight: 700; }
    .ap-mini-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
    .ap-mini { display: grid; grid-template-columns: 110px 130px 1fr 150px; gap: .8rem; padding: .55rem .7rem; background: var(--app-card-soft); border: 1px solid var(--app-border); border-radius: 10px; font-size: .82rem; align-items: center; }
    .ap-mini-user { font-weight: 700; color: var(--app-text); }
    .ap-mini-reason { color: var(--app-text-muted); }
    .ap-mini-time { color: var(--app-text-muted); font-size: .74rem; text-align: right; }

    .ap-filter { display: flex; gap: .5rem; flex-wrap: wrap; }
    .ap-filter-input {
      flex: 1; min-width: 220px;
      padding: .55rem .8rem;
      border-radius: 10px;
      background: var(--app-card-soft);
      border: 1px solid var(--app-border);
      color: var(--app-text);
      font: inherit;
    }
    .ap-btn {
      padding: .55rem .9rem;
      border-radius: 10px;
      border: 1px solid var(--app-border);
      background: var(--app-card-soft);
      color: var(--app-text);
      font: inherit; font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ap-btn:hover { filter: brightness(1.15); }
    .ap-btn:disabled { opacity: .6; cursor: not-allowed; }
    .ap-btn--ghost { background: transparent; }
    .ap-btn--success { background: rgba(16,185,129,.18); border-color: rgba(16,185,129,.4); color: #6ee7b7; }
    .ap-btn--sm { padding: .32rem .6rem; font-size: .78rem; }
    .ap-error { color: #fca5a5; margin: .7rem 0 0; font-size: .85rem; }
    .ap-loading, .ap-empty { color: var(--app-text-muted); margin: 0; }

    .ap-user-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem; }
    .ap-user {
      padding: 1rem;
      border-radius: 12px;
      background: var(--app-card-soft);
      border: 1px solid var(--app-border);
    }
    .ap-user-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .ap-user-name { margin: 0; font-weight: 700; }
    .ap-user-handle { color: var(--app-text-muted); font-weight: 500; margin-left: .4rem; }
    .ap-user-meta { margin: .25rem 0 0; color: var(--app-text-muted); font-size: .78rem; }
    .ap-user-actions { display: flex; gap: .5rem; align-items: center; }
    .ap-pill { padding: .22rem .6rem; border-radius: 999px; font-size: .7rem; font-weight: 800; letter-spacing: .05em; }
    .ap-pill--bad { background: rgba(239,68,68,.18); color: #fca5a5; }
    .ap-pill--warn { background: rgba(249,115,22,.18); color: #fdba74; }
    .ap-pill--good { background: rgba(34,197,94,.16); color: #86efac; }
    .ap-pill--neutral { background: rgba(148,163,184,.18); color: #cbd5e1; }

    .ap-filter-label { display: flex; flex-direction: column; gap: .25rem; font-size: .75rem; color: var(--app-text-muted); }
    .ap-filter-label select { padding: .5rem .7rem; border-radius: 10px; border: 1px solid var(--app-border); background: var(--app-card); color: var(--app-text); }

    .ap-feed-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .8rem; }
    .ap-feed-item {
      padding: 1rem;
      border-radius: 12px;
      background: var(--app-card-soft);
      border: 1px solid var(--app-border);
      display: flex;
      flex-direction: column;
      gap: .55rem;
    }
    .ap-feed-head { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; font-size: .85rem; }
    .ap-feed-target { color: var(--app-text); flex: 1; min-width: 0; }
    .ap-feed-time { color: var(--app-text-muted); font-size: .75rem; }
    .ap-feed-body p { margin: .25rem 0; font-size: .9rem; }
    .ap-feed-quote {
      margin: .5rem 0 .25rem;
      padding: .55rem .75rem;
      border-left: 3px solid var(--app-accent);
      background: var(--app-card);
      border-radius: 4px;
      font-size: .9rem;
      color: var(--app-text);
    }
    .ap-feed-actions { display: flex; gap: .5rem; flex-wrap: wrap; }

    .ap-modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.62);
      display: flex; align-items: center; justify-content: center;
      z-index: 9000; padding: 1rem;
    }
    .ap-modal {
      max-width: 460px; width: 100%;
      background: var(--app-card);
      border: 1px solid var(--app-border);
      border-radius: 16px;
      padding: 1.5rem;
      display: flex; flex-direction: column; gap: .8rem;
      box-shadow: 0 30px 80px -40px rgba(0,0,0,0.7);
    }
    .ap-modal-title { margin: 0; font-size: 1.1rem; font-weight: 700; }
    .ap-modal-sub { margin: 0; color: var(--app-text); }
    .ap-modal-desc { margin: 0; color: var(--app-text-muted); font-size: .85rem; line-height: 1.5; }
    .ap-field { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; color: var(--app-text-muted); }
    .ap-field input, .ap-field textarea {
      padding: .55rem .7rem;
      border-radius: 10px;
      border: 1px solid var(--app-border);
      background: var(--app-card-soft);
      color: var(--app-text);
      font-family: inherit;
      font-size: .9rem;
    }
    .ap-modal-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .4rem; }
    .ap-btn--danger { background: #ef4444; color: #fff; border-color: #ef4444; }
    .ap-btn--danger:hover { background: #dc2626; }

    .ap-warning-list { list-style: none; padding: 0; margin: .85rem 0 0; display: flex; flex-direction: column; gap: .6rem; }
    .ap-warning {
      padding: .7rem .8rem;
      border-radius: 10px;
      background: var(--app-card);
      border: 1px solid var(--app-border);
    }
    .ap-warning-head { display: flex; justify-content: space-between; align-items: baseline; }
    .ap-warning-kind { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .ap-warning-time { font-size: .74rem; color: var(--app-text-muted); }
    .ap-warning-reason { margin: .3rem 0; font-size: .86rem; }
    .ap-warning-excerpt {
      margin: .3rem 0;
      padding-left: .6rem;
      border-left: 2px solid var(--app-border);
      color: var(--app-text-muted);
      font-style: italic;
      font-size: .82rem;
    }
    .ap-warning-actions { margin-top: .4rem; }

    .ap-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .ap-table th, .ap-table td { padding: .6rem .55rem; text-align: left; border-bottom: 1px solid var(--app-border); vertical-align: middle; }
    .ap-table th { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--app-text-muted); font-weight: 700; }
    .ap-table tr:hover td { background: var(--app-card-soft); }
    .ap-user-cell { display: flex; flex-direction: column; gap: .15rem; }
    .ap-row-actions { display: flex; gap: .35rem; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
    .ap-cell-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; color: var(--app-text-muted); white-space: nowrap; }
    .ap-summary { cursor: pointer; color: var(--app-accent); font-weight: 600; user-select: none; }
    .ap-pre { margin: .35rem 0 0; padding: .5rem .6rem; background: var(--app-card-soft); border: 1px solid var(--app-border); border-radius: 8px; font-size: .72rem; max-width: 480px; max-height: 220px; overflow: auto; }

    .ap-load-more { width: 100%; margin-top: 1rem; }

    @media (max-width: 720px) {
      .ap-mini { grid-template-columns: 1fr; }
      .ap-mini-time { text-align: left; }
      .ap-table { font-size: .78rem; }
    }

    /* Phone refinements — admin tabs overflow + table-row horizontal scroll. */
    @media (max-width: 480px) {
      .ap-page { padding: 0.75rem 0.7rem 4rem; }
      .ap-hero { padding: 1rem 0.9rem; gap: 0.6rem; }
      .ap-hero-title { font-size: 1.15rem; }
      .ap-hero-sub { font-size: 0.82rem; }
      /* Tab strip — allow horizontal scroll so all 8 tabs are reachable on
         narrow viewports without wrapping into 3 rows. */
      .ap-tabs {
        overflow-x: auto;
        scrollbar-width: none;
        flex-wrap: nowrap;
      }
      .ap-tabs::-webkit-scrollbar { display: none; }
      .ap-tab {
        flex: 0 0 auto;
        white-space: nowrap;
        padding: 0.55rem 0.85rem;
      }
      .ap-card { padding: 0.85rem; }
      .ap-feed-item { padding: 0.85rem; }
      .ap-table {
        /* Table can have many columns; let it scroll horizontally rather than
           clip. */
        display: block;
        overflow-x: auto;
      }
      .ap-filter-input,
      .ap-card input,
      .ap-card textarea,
      .ap-card select {
        /* Suppress iOS focus-zoom. */
        font-size: 16px;
      }
    }

    @media (pointer: coarse) {
      .ap-btn { min-height: 38px; }
      .ap-btn--sm { min-height: 34px; }
      .ap-tab { min-height: 40px; }
      .ap-filter-input { min-height: 40px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ap-btn,
      .ap-feed-item,
      .ap-tab,
      .ap-card { transition: none !important; }
    }
  `}</style>
);
