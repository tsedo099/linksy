"use client";

import { AppShell } from "@/components/app-shell";
import { useLanguagePreferences } from "@/components/language-provider";
import type { AppLanguage } from "@/lib/language";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STRINGS: Record<"en" | "mn", {
  title: string;
  subtitle: string;
  yourStatus: string;
  activeWarnings: string;
  rollingWindow: (days: number) => string;
  commenting: string;
  open: string;
  paused: string;
  pausedUntil: (until: string, remaining: string) => string;
  pausedHint: (threshold: number, banDays: number) => string;
  lastWarning: string;
  never: string;
  keepKind: string;
  rulesTitle: string;
  rules: Array<{ title: string; desc: string; tag: "warn" | "block" }>;
  warning: string;
  blocked: string;
  tryItOut: string;
  tryHint: string;
  placeholder: string;
  scanning: string;
  waiting: string;
  healthy: string;
  recentTitle: string;
  recentSub: string;
  emptyHistory: string;
  pillAllClear: string;
  pillPaused: string;
  pillWarnings: (n: number, t: number) => string;
  actionLabels: Record<"allow" | "warn" | "quarantine" | "block", string>;
  scoreLabel: (n: number) => string;
  loadError: string;
}> = {
  en: {
    title: "Safe Social",
    subtitle: "Automated comment moderation. Warns instead of hiding comments — three warnings pause your commenting for a week.",
    yourStatus: "Your status",
    activeWarnings: "Active warnings",
    rollingWindow: (d) => `Rolling ${d}-day window`,
    commenting: "Commenting",
    open: "Open",
    paused: "Paused",
    pausedUntil: (until, remaining) => `Unlocks in ${remaining} (${until})`,
    pausedHint: (t, b) => `If you cross ${t} warnings, posting is paused for ${b} days.`,
    lastWarning: "Last warning",
    never: "Never",
    keepKind: "Keep it that way.",
    rulesTitle: "What triggers a warning?",
    rules: [
      { title: "Threats & self-harm", desc: "Wishing harm on someone (or yourself) is never allowed. Comments are blocked immediately.", tag: "block" },
      { title: "Personal attacks", desc: "Calling people stupid, idiot, etc. triggers a warning. 3 warnings → 1-week comment pause.", tag: "warn" },
      { title: "Link spam", desc: "Posting 3 or more links in a single comment triggers a warning.", tag: "warn" },
      { title: "Repeated wording", desc: "Long comments where one word dominates may read as spam — warning issued.", tag: "warn" },
      { title: "All caps", desc: "TYPING LIKE THIS reads as shouting. Flagged gently — no warning, just a heads-up.", tag: "warn" },
    ],
    warning: "Warning",
    blocked: "Blocked",
    tryItOut: "Try it out",
    tryHint: "Type a comment to preview how the moderator would react. Nothing is saved.",
    placeholder: "Type a comment…",
    scanning: "Scanning…",
    waiting: "Waiting for input.",
    healthy: "Looks healthy.",
    recentTitle: "Recent warnings",
    recentSub: "Latest 10",
    emptyHistory: "No warnings yet — keep being kind.",
    pillAllClear: "All clear",
    pillPaused: "Paused",
    pillWarnings: (n, t) => `${n}/${t} warnings`,
    actionLabels: { allow: "Allowed", warn: "Heads-up", quarantine: "Warning", block: "Blocked" },
    scoreLabel: (n) => `score ${n.toFixed(2)}`,
    loadError: "Could not load your safety status.",
  },
  mn: {
    title: "Safe Social",
    subtitle: "Автомат сэтгэгдлийн модерац. Comment-ийг нуухын оронд анхааруулга өгнө — 3 анхааруулга авбал нэг 7 хоног сэтгэгдэл бичих эрх хаагдана.",
    yourStatus: "Таны төлөв",
    activeWarnings: "Идэвхтэй анхааруулга",
    rollingWindow: (d) => `Сүүлийн ${d} хоног`,
    commenting: "Сэтгэгдэл",
    open: "Нээлттэй",
    paused: "Хаалттай",
    pausedUntil: (until, remaining) => `${remaining}-н дараа сэргэнэ (${until})`,
    pausedHint: (t, b) => `${t} анхааруулга авбал ${b} хоног сэтгэгдэл бичих боломжгүй болно.`,
    lastWarning: "Сүүлд авсан анхааруулга",
    never: "Байхгүй",
    keepKind: "Сайхан үргэлжлүүлээрэй.",
    rulesTitle: "Юу нь анхааруулга өгдөг вэ?",
    rules: [
      { title: "Заналхийлэл, өөрийгөө хорлох", desc: "Хүн бусдыг (эсвэл өөрийгөө) хохироохыг хэлсэн үг шууд хаагдана.", tag: "block" },
      { title: "Хувь хүн рүү халдсан үг", desc: "Тэнэг, эргүү, идиот гэх мэт хараал ⇒ анхааруулга. 3 анхааруулга = 1 долоо хоног comment түр хаагдана.", tag: "warn" },
      { title: "Линкэн спам", desc: "Нэг comment дотор 3+ линк байвал анхааруулга өгнө.", tag: "warn" },
      { title: "Үг давталт", desc: "Нэг үгийг олонтоо давтсан урт текст спам шиг харагдаж анхааруулга авна.", tag: "warn" },
      { title: "Том үсэг", desc: "БҮХ ТОМ ҮСГЭЭР БИЧИХ нь хашгирах мэт мэдрэгддэг. Зөвхөн анхааруулга, ban биш.", tag: "warn" },
    ],
    warning: "Анхааруулга",
    blocked: "Хаасан",
    tryItOut: "Туршаад үзэх",
    tryHint: "Comment бичих үед модераторын хариу урьдчилан харагдана. Юу ч хадгалагдахгүй.",
    placeholder: "Сэтгэгдэл бичих…",
    scanning: "Шалгаж байна…",
    waiting: "Бичихийг хүлээж байна.",
    healthy: "Зүгээр харагдаж байна.",
    recentTitle: "Сүүлийн анхааруулгууд",
    recentSub: "Сүүлийн 10",
    emptyHistory: "Анхааруулга байхгүй — тийнхэн үргэлжлүүлээрэй.",
    pillAllClear: "Цэвэр",
    pillPaused: "Хаалттай",
    pillWarnings: (n, t) => `${n}/${t} анхааруулга`,
    actionLabels: { allow: "Зөвшөөрсөн", warn: "Анхааруулсан", quarantine: "Анхааруулга", block: "Хаасан" },
    scoreLabel: (n) => `оноо ${n.toFixed(2)}`,
    loadError: "Аюулгүйн төлвийг ачаалж чадсангүй.",
  },
};

function pickStrings(language: AppLanguage) {
  if (language === "mn") return STRINGS.mn;
  return STRINGS.en;
}

type ModerationAction = "allow" | "warn" | "quarantine" | "block";

type ModerationFinding = {
  kind: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  message: string;
  matchedTerms?: string[];
};

type ModerationPreview = {
  allowed: boolean;
  action: ModerationAction;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  userMessage: string | null;
  findings: ModerationFinding[];
};

type SafetyStatus = {
  warnings: number;
  banUntil: string | null;
  banActive: boolean;
  banRemainingMs: number;
  threshold: number;
  windowDays: number;
  banDurationDays: number;
  lastWarningAt: string | null;
  recentWarnings: Array<{
    id: string;
    kind: string;
    severity: string;
    score: number;
    reason: string;
    excerpt: string | null;
    createdAt: string;
  }>;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0m";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function relativeTime(iso: string, language: AppLanguage = "en"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const mn = language === "mn";
  if (m < 1) return mn ? "сая" : "just now";
  if (m < 60) return mn ? `${m} мин өмнө` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return mn ? `${h} цаг өмнө` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return mn ? `${d} хоног өмнө` : `${d}d ago`;
}

const SEVERITY_COLOR: Record<string, string> = {
  LOW: "#7cecff",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  CRITICAL: "#ef4444",
};

export function SafeSocialScreen() {
  const { language } = useLanguagePreferences();
  const t = useMemo(() => pickStrings(language), [language]);
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [preview, setPreview] = useState<ModerationPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/safety/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((data) => {
        if (alive) setStatus(data.status as SafetyStatus);
      })
      .catch((err) => {
        if (alive) setStatusErr((err as Error).message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const runPreview = useCallback((text: string) => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (!text.trim()) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    previewTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/comments/moderate-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`preview ${res.status}`);
        const data = await res.json();
        setPreview(data.moderation as ModerationPreview);
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 220);
  }, []);

  useEffect(() => () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
  }, []);

  const progressPct = useMemo(() => {
    if (!status) return 0;
    return Math.min(100, Math.round((status.warnings / status.threshold) * 100));
  }, [status]);

  return (
    <AppShell>
      <div className="ss-page">
        <header className="ss-hero">
          <div className="ss-hero-badge" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z" />
            </svg>
          </div>
          <div>
            <h1 className="ss-hero-title">{t.title}</h1>
            <p className="ss-hero-sub">{t.subtitle}</p>
          </div>
        </header>

        {statusErr ? (
          <div className="ss-card ss-card--alert">
            <p>{t.loadError} {statusErr}</p>
          </div>
        ) : null}

        <section className="ss-card">
          <header className="ss-card-head">
            <h2 className="ss-card-title">{t.yourStatus}</h2>
            <span className={`ss-pill ${status?.banActive ? "ss-pill--bad" : status && status.warnings > 0 ? "ss-pill--warn" : "ss-pill--good"}`}>
              {status?.banActive
                ? t.pillPaused
                : status && status.warnings > 0
                  ? t.pillWarnings(status.warnings, status.threshold)
                  : t.pillAllClear}
            </span>
          </header>

          {status ? (
            <div className="ss-status-grid">
              <div className="ss-stat">
                <span className="ss-stat-label">{t.activeWarnings}</span>
                <span className="ss-stat-value">{status.warnings} <small>/ {status.threshold}</small></span>
                <div className="ss-progress">
                  <div className="ss-progress-bar" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="ss-stat-note">{t.rollingWindow(status.windowDays)}</span>
              </div>
              <div className="ss-stat">
                <span className="ss-stat-label">{t.commenting}</span>
                <span className="ss-stat-value">
                  {status.banActive ? t.paused : t.open}
                </span>
                <span className="ss-stat-note">
                  {status.banActive && status.banUntil
                    ? t.pausedUntil(new Date(status.banUntil).toLocaleString(), formatRemaining(status.banRemainingMs))
                    : t.pausedHint(status.threshold, status.banDurationDays)}
                </span>
              </div>
              <div className="ss-stat">
                <span className="ss-stat-label">{t.lastWarning}</span>
                <span className="ss-stat-value">
                  {status.lastWarningAt ? relativeTime(status.lastWarningAt, language) : t.never}
                </span>
                <span className="ss-stat-note">
                  {status.lastWarningAt ? new Date(status.lastWarningAt).toLocaleString() : t.keepKind}
                </span>
              </div>
            </div>
          ) : (
            <div className="ss-skeleton" />
          )}
        </section>

        <section className="ss-card">
          <header className="ss-card-head">
            <h2 className="ss-card-title">{t.rulesTitle}</h2>
          </header>
          <ul className="ss-rules">
            {t.rules.map((rule, idx) => (
              <li key={idx} className="ss-rule">
                <span className={`ss-rule-dot ss-rule-dot--${rule.tag}`} aria-hidden />
                <div>
                  <p className="ss-rule-title">
                    {rule.title}
                    <span className={`ss-rule-tag ss-rule-tag--${rule.tag}`}>
                      {rule.tag === "block" ? t.blocked : t.warning}
                    </span>
                  </p>
                  <p className="ss-rule-desc">{rule.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ss-card">
          <header className="ss-card-head">
            <h2 className="ss-card-title">{t.tryItOut}</h2>
            <span className="ss-card-sub">{t.tryHint}</span>
          </header>
          <textarea
            className="ss-preview-input"
            placeholder={t.placeholder}
            value={previewText}
            onChange={(e) => {
              setPreviewText(e.target.value);
              runPreview(e.target.value);
            }}
            rows={3}
          />
          <div className="ss-preview-result">
            {previewing && !preview ? (
              <span className="ss-preview-status">{t.scanning}</span>
            ) : preview ? (
              <>
                <div className={`ss-preview-action ss-preview-action--${preview.action}`}>
                  {t.actionLabels[preview.action]} · {t.scoreLabel(preview.score)}
                </div>
                {preview.findings.length > 0 ? (
                  <ul className="ss-preview-findings">
                    {preview.findings
                      .filter((f) => f.kind !== "healthy-friction")
                      .map((f, i) => (
                        <li key={i}>
                          <span className="ss-find-kind" style={{ color: SEVERITY_COLOR[f.severity] }}>
                            {f.kind}
                          </span>
                          <span className="ss-find-msg">{f.message}</span>
                          {f.matchedTerms && f.matchedTerms.length > 0 ? (
                            <span className="ss-find-terms">{f.matchedTerms.join(", ")}</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="ss-preview-status">{t.healthy}</p>
                )}
              </>
            ) : (
              <span className="ss-preview-status">{t.waiting}</span>
            )}
          </div>
        </section>

        <section className="ss-card">
          <header className="ss-card-head">
            <h2 className="ss-card-title">{t.recentTitle}</h2>
            <span className="ss-card-sub">{t.recentSub}</span>
          </header>
          {status && status.recentWarnings.length > 0 ? (
            <ul className="ss-history">
              {status.recentWarnings.map((w) => (
                <li key={w.id} className="ss-history-item">
                  <div className="ss-history-head">
                    <span className="ss-history-kind" style={{ color: SEVERITY_COLOR[w.severity] ?? "var(--app-text)" }}>
                      {w.kind}
                    </span>
                    <span className="ss-history-time">{relativeTime(w.createdAt, language)}</span>
                  </div>
                  <p className="ss-history-reason">{w.reason}</p>
                  {w.excerpt ? <p className="ss-history-excerpt">&ldquo;{w.excerpt}&rdquo;</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ss-empty">{t.emptyHistory}</p>
          )}
        </section>
      </div>

      <style jsx>{`
        .ss-page {
          max-width: 760px;
          margin: 0 auto;
          padding: 2rem 1.2rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
          color: var(--app-text);
        }

        .ss-hero {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.4rem 1.5rem;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(124, 236, 255, 0.08), rgba(168, 140, 255, 0.10));
          border: 1px solid var(--app-border);
        }
        .ss-hero-badge {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: rgba(124, 236, 255, 0.16);
          color: var(--app-accent, #7cecff);
          flex-shrink: 0;
        }
        .ss-hero-title {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .ss-hero-sub {
          margin: 0.25rem 0 0;
          color: var(--app-text-muted);
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .ss-card {
          padding: 1.2rem 1.3rem;
          border-radius: 16px;
          background: var(--app-card);
          border: 1px solid var(--app-border);
        }
        .ss-card--alert {
          border-color: rgba(239, 68, 68, 0.42);
          background: rgba(239, 68, 68, 0.08);
          color: #fecaca;
        }
        .ss-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.85rem;
        }
        .ss-card-title {
          margin: 0;
          font-size: 1.02rem;
          font-weight: 700;
        }
        .ss-card-sub {
          color: var(--app-text-muted);
          font-size: 0.78rem;
        }

        .ss-pill {
          padding: 0.28rem 0.7rem;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .ss-pill--good {
          background: rgba(16, 185, 129, 0.14);
          color: #6ee7b7;
        }
        .ss-pill--warn {
          background: rgba(245, 158, 11, 0.16);
          color: #fbbf24;
        }
        .ss-pill--bad {
          background: rgba(239, 68, 68, 0.18);
          color: #fca5a5;
        }

        .ss-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }
        .ss-stat {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.85rem 0.9rem;
          border-radius: 12px;
          background: var(--app-card-soft);
          border: 1px solid var(--app-border);
        }
        .ss-stat-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--app-text-muted);
        }
        .ss-stat-value {
          font-size: 1.25rem;
          font-weight: 700;
        }
        .ss-stat-value small {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--app-text-muted);
        }
        .ss-stat-note {
          font-size: 0.74rem;
          color: var(--app-text-muted);
          line-height: 1.4;
        }

        .ss-progress {
          height: 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .ss-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #7cecff, #a88cff);
          transition: width 0.3s ease;
        }

        .ss-skeleton {
          height: 5rem;
          border-radius: 12px;
          background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04));
          background-size: 200% 100%;
          animation: ss-shimmer 1.4s infinite;
        }
        @keyframes ss-shimmer {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }

        .ss-rules {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .ss-rule {
          display: flex;
          gap: 0.85rem;
          align-items: flex-start;
        }
        .ss-rule-dot {
          width: 9px;
          height: 9px;
          margin-top: 0.45rem;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .ss-rule-dot--warn { background: #f59e0b; }
        .ss-rule-dot--block { background: #ef4444; }

        .ss-rule-title {
          margin: 0;
          font-weight: 600;
          font-size: 0.92rem;
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }
        .ss-rule-tag {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 0.16rem 0.45rem;
          border-radius: 999px;
          text-transform: uppercase;
        }
        .ss-rule-tag--warn { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
        .ss-rule-tag--block { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
        .ss-rule-desc {
          margin: 0.25rem 0 0;
          color: var(--app-text-muted);
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .ss-preview-input {
          width: 100%;
          padding: 0.85rem 0.95rem;
          border-radius: 12px;
          background: var(--app-card-soft);
          border: 1px solid var(--app-border);
          color: var(--app-text);
          font-family: inherit;
          font-size: 0.92rem;
          resize: vertical;
          min-height: 70px;
        }
        .ss-preview-input:focus {
          outline: 2px solid rgba(124, 236, 255, 0.4);
          outline-offset: 1px;
        }

        .ss-preview-result {
          margin-top: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .ss-preview-status {
          color: var(--app-text-muted);
          font-size: 0.84rem;
        }
        .ss-preview-action {
          align-self: flex-start;
          padding: 0.4rem 0.75rem;
          border-radius: 999px;
          font-weight: 700;
          font-size: 0.78rem;
          letter-spacing: 0.02em;
        }
        .ss-preview-action--allow { background: rgba(16, 185, 129, 0.14); color: #6ee7b7; }
        .ss-preview-action--warn { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
        .ss-preview-action--quarantine { background: rgba(245, 158, 11, 0.22); color: #fbbf24; }
        .ss-preview-action--block { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }

        .ss-preview-findings {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .ss-preview-findings li {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem 0.7rem;
          font-size: 0.84rem;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          background: var(--app-card-soft);
          border: 1px solid var(--app-border);
        }
        .ss-find-kind {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.7rem;
          letter-spacing: 0.05em;
        }
        .ss-find-msg { color: var(--app-text); }
        .ss-find-terms {
          color: var(--app-text-muted);
          font-style: italic;
          font-size: 0.78rem;
        }

        .ss-history {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .ss-history-item {
          padding: 0.85rem 0.95rem;
          border-radius: 12px;
          background: var(--app-card-soft);
          border: 1px solid var(--app-border);
        }
        .ss-history-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 0.25rem;
        }
        .ss-history-kind {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ss-history-time {
          font-size: 0.74rem;
          color: var(--app-text-muted);
        }
        .ss-history-reason {
          margin: 0;
          font-size: 0.88rem;
          color: var(--app-text);
        }
        .ss-history-excerpt {
          margin: 0.35rem 0 0;
          padding-left: 0.65rem;
          border-left: 2px solid var(--app-border);
          color: var(--app-text-muted);
          font-size: 0.82rem;
          font-style: italic;
        }
        .ss-empty {
          margin: 0;
          color: var(--app-text-muted);
          font-size: 0.88rem;
        }
      `}</style>
    </AppShell>
  );
}
