"use client";

import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { LocationAutocompleteInput } from "@/components/location-autocomplete-input";
import { formatBytes, STORY_ALLOWED_MEDIA_TYPES, STORY_MEDIA_MAX_SIZE } from "@/lib/story-limits";
import { ArrowRight, Image as ImageIcon, MapPin, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ApiPost } from "./feed-api-post-types";

const CHAR_LIMIT = 500;
const MEDIA_LIMIT = 4;
const ACCEPTED_MEDIA = STORY_ALLOWED_MEDIA_TYPES.join(",");

const CPC_PLACEHOLDER_TEXT = "What's on your mind?";

const IcImage   = () => <ImageIcon         size={16} strokeWidth={1.9} aria-hidden />;
const IcMapPin  = () => <MapPin            size={16} strokeWidth={1.9} aria-hidden />;
const IcSliders = () => <SlidersHorizontal size={16} strokeWidth={1.9} aria-hidden />;
const IcX       = () => <X                 size={14} strokeWidth={2.2} aria-hidden />;
const IcArrow   = () => <ArrowRight        size={14} strokeWidth={2.2} aria-hidden />;

const PRIVACY_OPTIONS = [
  { k: "public", label: "Public", icon: "🌐", audience: "PUBLIC" as const },
  { k: "friends", label: "Friends", icon: "👥", audience: "FRIENDS" as const },
  { k: "close-circle", label: "Close Circle", icon: "🔒", audience: "CLOSE_CIRCLE" as const },
] as const;
type Privacy = typeof PRIVACY_OPTIONS[number]["k"];

type LocalMedia = {
  file: File;
  previewUrl: string;
  isVideo: boolean;
  alt: string;
};

export function CreatePostCard({ onCreated }: { onCreated: (post: ApiPost) => void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [showLocation, setShowLocation] = useState(false);
  const [location, setLocation] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const charLeft = CHAR_LIMIT - text.length;
  const charPct = Math.min(text.length / CHAR_LIMIT, 1);
  const r = 13;
  const circ = 2 * Math.PI * r;

  // Free object URLs on unmount / when media changes.
  useEffect(() => {
    return () => {
      media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    };
  }, [media]);

  function flashStatus(msg: string, ok: boolean) {
    setStatus({ msg, ok });
    window.setTimeout(() => {
      setStatus((current) => (current?.msg === msg ? null : current));
    }, 3200);
  }

  function resetComposer() {
    media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setMedia([]);
    setText("");
    setLocation("");
    setShowLocation(false);
    setExpanded(false);
    setPrivacy("public");
    setStatus(null);
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next: LocalMedia[] = [];
    let rejected: string | null = null;
    for (const file of Array.from(list)) {
      if (media.length + next.length >= MEDIA_LIMIT) {
        rejected = `You can attach up to ${MEDIA_LIMIT} files.`;
        break;
      }
      if (!STORY_ALLOWED_MEDIA_TYPES.includes(file.type as (typeof STORY_ALLOWED_MEDIA_TYPES)[number])) {
        rejected = `Unsupported file type: ${file.type || "unknown"}.`;
        continue;
      }
      if (file.size > STORY_MEDIA_MAX_SIZE) {
        rejected = `${file.name} is larger than ${formatBytes(STORY_MEDIA_MAX_SIZE)}.`;
        continue;
      }
      next.push({
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
        alt: "",
      });
    }
    if (next.length > 0) setMedia((prev) => [...prev, ...next]);
    if (rejected) flashStatus(rejected, false);
  }

  function removeMedia(index: number) {
    setMedia((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function setAlt(index: number, alt: string) {
    setMedia((prev) => prev.map((m, i) => (i === index ? { ...m, alt: alt.slice(0, 200) } : m)));
  }

  async function uploadAll(): Promise<string[]> {
    if (media.length === 0) return [];
    const urls: string[] = [];
    setUploadingCount(media.length);
    try {
      for (const m of media) {
        const fd = new FormData();
        fd.append("file", m.file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Upload failed.");
        }
        const data = await res.json();
        urls.push(data.url as string);
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    } finally {
      setUploadingCount(0);
    }
    return urls;
  }

  async function publishPost() {
    const caption = text.trim();
    const trimmedLocation = location.trim();
    if (publishing) return;
    if (!caption && media.length === 0) {
      flashStatus("Add a caption or attach media before publishing.", false);
      return;
    }

    setPublishing(true);
    try {
      const mediaUrls = await uploadAll();
      const audience = PRIVACY_OPTIONS.find((p) => p.k === privacy)?.audience ?? "PUBLIC";

      const body: Record<string, unknown> = {
        mediaUrls,
        caption: caption || undefined,
        audience,
      };
      if (mediaUrls.length > 0) {
        body.mediaAltTexts = media.map((m) => m.alt.trim());
      }
      if (trimmedLocation) body.location = trimmedLocation;

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not publish the post.");
      }

      onCreated(data.post as ApiPost);
      resetComposer();
      flashStatus("Posted successfully.", true);
    } catch (error) {
      flashStatus((error as Error).message, false);
    } finally {
      setPublishing(false);
    }
  }

  const advancedHref = (() => {
    const params = new URLSearchParams();
    if (text.trim()) params.set("caption", text.trim());
    if (location.trim()) params.set("location", location.trim());
    if (privacy !== "public") {
      const aud = PRIVACY_OPTIONS.find((p) => p.k === privacy)?.audience;
      if (aud) params.set("audience", aud);
    }
    const qs = params.toString();
    return qs ? `/create?${qs}` : "/create";
  })();

  const busy = publishing || uploadingCount > 0;

  function goToCreate() {
    router.push("/create");
  }

  return (
    <div className={`cpc${expanded ? " cpc--open" : ""}`}>
      {expanded && <div className="cpc-accent-bar" />}
      <div
        className={`cpc-inner${!expanded ? " cpc-inner--teaser" : ""}`}
        onClick={!expanded ? goToCreate : undefined}
      >

        <div className="cpc-row">
          <CurrentUserAvatar
            className="cpc-av"
            imageClassName="cpc-av-image"
          />
          <div className="cpc-input-area">
            {expanded ? (
              <textarea
                className="cpc-textarea"
                placeholder={CPC_PLACEHOLDER_TEXT}
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, CHAR_LIMIT))}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void publishPost();
                  }
                }}
                rows={3}
                disabled={busy}
              />
            ) : (
              <span className="cpc-placeholder">{CPC_PLACEHOLDER_TEXT}</span>
            )}
          </div>
          {!expanded && (
            <button
              type="button"
              className="cpc-compose-btn"
              onClick={(e) => {
                e.stopPropagation();
                goToCreate();
              }}
              aria-label="Compose"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="16" height="16">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          )}
        </div>

        {expanded && media.length > 0 && (
          <>
            <div className="cpc-media-strip" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.55rem", marginTop: "0.6rem" }}>
            {media.map((m, i) => (
              <div key={m.previewUrl} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--feed-border)" }}>
                {m.isVideo ? (
                  <video
                    src={m.previewUrl}
                    style={{ width: "100%", height: 90, objectFit: "cover", display: "block", background: "#000" }}
                    muted
                    aria-label={m.alt.trim() ? m.alt : `Video ${i + 1} preview`}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.previewUrl}
                    alt={m.alt.trim() ? m.alt : ""}
                    style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  aria-label="Remove attachment"
                  style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", cursor: "pointer", display: "grid", placeItems: "center" }}
                  disabled={busy}
                >
                  <IcX />
                </button>
                <input
                  id={`cpc-alt-${i}`}
                  className="cpc-alt-input"
                  type="text"
                  placeholder={`Optional description (${m.isVideo ? "video" : "image"} ${i + 1})`}
                  aria-label={`Optional description for ${m.isVideo ? "video" : "image"} ${i + 1}`}
                  value={m.alt}
                  onChange={(e) => setAlt(i, e.target.value)}
                  disabled={busy}
                  style={{ width: "100%", padding: "5px 7px", fontSize: "0.72rem", border: "none", background: "var(--feed-card-2, var(--feed-card))", color: "var(--text)", borderTop: "1px solid var(--feed-border)" }}
                />
              </div>
            ))}
            </div>
          </>
        )}

        {expanded && showLocation && (
          <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <IcMapPin />
            <LocationAutocompleteInput
              value={location}
              onChange={setLocation}
              placeholder="Search location"
              maxLength={80}
              disabled={busy}
              className="cpc-location-ac"
              inputClassName="cpc-location-input"
              inputStyle={{
                width: "100%",
                padding: "0.4rem 0.55rem",
                borderRadius: 8,
                border: "1px solid var(--feed-border)",
                background: "var(--feed-card)",
                color: "var(--text)",
                fontSize: "0.82rem",
                boxSizing: "border-box",
              }}
              aria-label="Post location"
            />
            <button
              type="button"
              onClick={() => { setShowLocation(false); setLocation(""); }}
              aria-label="Remove location"
              className="cpc-tool"
              style={{ padding: "0.3rem", borderRadius: 6 }}
              disabled={busy}
            >
              <IcX />
            </button>
          </div>
        )}

        {expanded && (
          <div className="cpc-meta-row">
            <div className="cpc-privacy-pills">
              {PRIVACY_OPTIONS.map(({ k, label, icon }) => (
                <button key={k} className={`cpc-privacy-pill${privacy === k ? " cpc-privacy-pill--on" : ""}`}
                  onClick={() => setPrivacy(k)} disabled={busy} type="button">
                  <span>{icon}</span>{label}
                </button>
              ))}
            </div>
            <div className="cpc-char-ring">
              <svg viewBox="0 0 32 32" width="28" height="28">
                <circle cx="16" cy="16" r={r} fill="none" stroke="var(--feed-border)" strokeWidth="3"/>
                <circle cx="16" cy="16" r={r} fill="none"
                  stroke={charLeft < 50 ? "#ef4444" : charLeft < 100 ? "#f59e0b" : "var(--feed-accent)"}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${circ}`}
                  strokeDashoffset={`${circ * (1 - charPct)}`}
                  transform="rotate(-90 16 16)"
                />
              </svg>
              {charLeft < 100 && <span className="cpc-char-count">{charLeft}</span>}
            </div>
          </div>
        )}

        {expanded && (
          <div className="cpc-toolbar">
            <div className="cpc-tools">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_MEDIA}
                multiple
                hidden
                onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
              />
              <button
                type="button"
                className="cpc-tool"
                title={media.length >= MEDIA_LIMIT ? "Media limit reached" : "Add photo or video"}
                onClick={() => fileRef.current?.click()}
                disabled={busy || media.length >= MEDIA_LIMIT}
              >
                <IcImage />
              </button>
              <button
                type="button"
                className={`cpc-tool${showLocation ? " cpc-tool--on" : ""}`}
                title="Add location"
                onClick={() => setShowLocation((v) => !v)}
                disabled={busy}
              >
                <IcMapPin />
              </button>
              <Link
                href={advancedHref}
                className="cpc-tool"
                title="Open advanced editor (poll, schedule, draft, album, comment moderation)"
                style={{ display: "inline-grid", placeItems: "center", textDecoration: "none", color: "inherit" }}
                aria-label="Open advanced editor"
              >
                <IcSliders />
              </Link>
              {uploadingCount > 0 && (
                <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", color: "var(--muted)" }}>
                  Uploading {media.length - uploadingCount + 1}/{media.length}…
                </span>
              )}
            </div>
            <div className="cpc-actions-right">
              <button className="cpc-cancel-btn" onClick={resetComposer} disabled={busy}>Cancel</button>
              <button
                className={`cpc-publish-btn${(text.trim() || media.length > 0) ? " cpc-publish-btn--ready" : ""}`}
                disabled={busy || (!text.trim() && media.length === 0)}
                onClick={() => { void publishPost(); }}
              >
                <span>{publishing ? "Publishing…" : uploadingCount > 0 ? "Uploading…" : "Publish"}</span>
                <IcArrow />
              </button>
            </div>
          </div>
        )}

        {status && (
          <div className={`cpc-status${status.ok ? " cpc-status--ok" : " cpc-status--err"}`}>
            {status.msg}
          </div>
        )}

      </div>
    </div>
  );
}
