"use client";

import { AppShell } from "@/components/app-shell";
import { normalizePollOptions } from "@/lib/create-poll";
import { createPostDraftClientSchema, createPostShareClientSchema } from "@/lib/schemas/create-post-client";
import { uploadUserMedia } from "@/lib/create-media-upload";
import { displayMediaSrc } from "@/lib/media";
import { CreateAudiencePicker } from "@/components/create/audience-picker";
import { CreatePollEditor } from "@/components/create/poll-editor";
import { AdultContentToggle } from "@/components/adult-content-toggle";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguagePreferences } from "@/components/language-provider";
import { CS_STRINGS } from "@/components/create/create-strings";
import {
  ALBUM_NEW,
  ALBUM_NONE,
  FORMATS,
  type FormatKey,
  IcArrowL,
  IcCheck,
  IcLoader,
  IcSmile,
  IcX,
  QUICK_EMOJIS,
  type TagUser,
  Toggle,
} from "@/components/create/create-primitives";
import { CreateScreenStyles } from "@/components/create/create-styles";
import { CreateMediaCanvas } from "@/components/create/create-media-canvas";
import { CreatePostPreview } from "@/components/create/create-post-preview";
import { CreateMetadataFields } from "@/components/create/create-metadata-fields";

export function CreateScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguagePreferences();
  const cs = useMemo(() => (language === "mn" ? CS_STRINGS.mn : CS_STRINGS.en), [language]);

  const [me, setMe] = useState<{
    username: string;
    displayName: string;
    defaultAllowComments?: boolean;
    defaultHideLikes?: boolean;
  } | null>(null);
  const [format, setFormat] = useState<FormatKey>("square");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [remoteMediaUrls, setRemoteMediaUrls] = useState<string[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftBootloading, setDraftBootloading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [audience, setAudience] = useState<"PUBLIC"|"FRIENDS"|"CLOSE_CIRCLE">("PUBLIC");
  /** Local datetime ("YYYY-MM-DDTHH:mm") when the author wants to schedule. */
  const [scheduleLocal, setScheduleLocal] = useState<string>("");
  const [withPoll, setWithPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDurationHours, setPollDurationHours] = useState<number>(24);
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikes, setHideLikes] = useState(false);
  const [containsAdultContent, setContainsAdultContent] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<TagUser[]>([]);
  const [tagSearching, setTagSearching] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<TagUser[]>([]);
  const [postSeriesList, setPostSeriesList] = useState<{ id: string; title: string; _count: { posts: number } }[]>([]);
  const [albumSelect, setAlbumSelect] = useState(ALBUM_NONE);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [moderateComments, setModerateComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mediaAltTexts, setMediaAltTexts] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const appliedAccountPostDefaults = useRef(false);

  const displayPreviews = useMemo(
    () => [...remoteMediaUrls.map((u) => displayMediaSrc(u) ?? u), ...previews],
    [remoteMediaUrls, previews],
  );

  function isRemoteVideoUrl(url: string) {
    return /\.(mp4|webm|mov)(\?|$)/i.test(url);
  }

  function isVideoAt(i: number) {
    const r = remoteMediaUrls.length;
    if (i < r) {
      const remote = remoteMediaUrls[i];
      return remote ? isRemoteVideoUrl(remote) : false;
    }
    return files[i - r]?.type.startsWith("video/") ?? false;
  }

  useEffect(() => {
    const draftParam = searchParams.get("draft");
    if (draftParam) {
      let cancelled = false;
      setDraftBootloading(true);
      fetch(`/api/posts/draft/${encodeURIComponent(draftParam)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.draft) return;
          const d = data.draft;
          setActiveDraftId(d.id);
          setCaption(d.caption ?? "");
          const aud = d.audience;
          if (aud === "PUBLIC" || aud === "FRIENDS" || aud === "CLOSE_CIRCLE") setAudience(aud);
          const urls: string[] = Array.isArray(d.mediaUrls) ? d.mediaUrls : [];
          setRemoteMediaUrls(urls);
          const alts: unknown[] = Array.isArray(d.mediaAltTexts) ? d.mediaAltTexts : [];
          setMediaAltTexts(urls.map((_, i) => (typeof alts[i] === "string" ? alts[i] : "")));
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setDraftBootloading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    // Hydrate from quick-composer handoff (?caption=&location=&audience=).
    setDraftBootloading(false);
    const captionParam = searchParams.get("caption");
    if (captionParam) setCaption(captionParam.slice(0, 2200));
    const locationParam = searchParams.get("location");
    if (locationParam) setLocation(locationParam.slice(0, 80));
    const audienceParam = searchParams.get("audience");
    if (audienceParam === "PUBLIC" || audienceParam === "FRIENDS" || audienceParam === "CLOSE_CIRCLE") {
      setAudience(audienceParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeIdx > 0 && activeIdx >= displayPreviews.length) {
      setActiveIdx(Math.max(0, displayPreviews.length - 1));
    }
  }, [displayPreviews.length, activeIdx]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) {
          setMe(d.user);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!me || appliedAccountPostDefaults.current) return;
    appliedAccountPostDefaults.current = true;
    setAllowComments(me.defaultAllowComments !== false);
    setHideLikes(me.defaultHideLikes === true);
  }, [me]);

  useEffect(() => {
    fetch("/api/post-series", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.series)) setPostSeriesList(d.series);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!allowComments) setModerateComments(false);
  }, [allowComments]);

  useEffect(() => { return () => previews.forEach(URL.revokeObjectURL); }, [previews]);

  useEffect(() => {
    const q = tagQuery.trim().replace(/^@/, "");
    if (!tagPickerOpen || !q) {
      setTagResults([]);
      setTagSearching(false);
      return;
    }

    setTagSearching(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json().catch(() => null)) as { users?: TagUser[] } | null;
        if (!response.ok || !Array.isArray(data?.users)) {
          setTagResults([]);
          return;
        }
        const selected = new Set(taggedUsers.map((user) => user.id));
        setTagResults(data.users.filter((user) => user.username !== me?.username && !selected.has(user.id)));
      } catch {
        if (!controller.signal.aborted) setTagResults([]);
      } finally {
        if (!controller.signal.aborted) setTagSearching(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [me?.username, tagPickerOpen, tagQuery, taggedUsers]);

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }

  function addTaggedUser(user: TagUser) {
    if (taggedUsers.some((item) => item.id === user.id)) return;
    if (user.username === me?.username) {
      flash(cs.flashCantSelfTag, false);
      return;
    }
    if (taggedUsers.length >= 5) {
      flash(cs.flashMaxTags, false);
      return;
    }
    setTaggedUsers((current) => [...current, user]);
    setTagQuery("");
    setTagResults([]);
    setTagPickerOpen(false);
  }

  function removeTaggedUser(userId: string) {
    setTaggedUsers((current) => current.filter((user) => user.id !== userId));
  }

  function addFiles(fl: FileList | null) {
    if (!fl) return;
    const valid = Array.from(fl).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!valid.length) { flash(cs.flashOnlyMedia, false); return; }
    setMediaAltTexts((p) => [...p, ...valid.map(() => "")]);
    setFiles(p => [...p, ...valid]);
    setPreviews(p => [...p, ...valid.map(f => URL.createObjectURL(f))]);
  }

  function removeFile(i: number) {
    setMediaAltTexts((alts) => alts.filter((_, j) => j !== i));
    const r = remoteMediaUrls.length;
    if (i < r) {
      setRemoteMediaUrls((arr) => arr.filter((_, j) => j !== i));
      setActiveIdx(0);
      return;
    }
    const li = i - r;
    const preview = previews[li];
    if (preview) URL.revokeObjectURL(preview);
    setFiles((p) => p.filter((_, j) => j !== li));
    setPreviews((p) => p.filter((_, j) => j !== li));
    setActiveIdx(0);
  }

  async function handleShare() {
    const parsed = createPostShareClientSchema.safeParse({
      caption,
      location,
      fileCount: files.length,
      remoteCount: remoteMediaUrls.length,
      mediaAltTexts,
      withPoll,
      pollQuestion,
      pollOptions,
    });
    if (!parsed.success) {
      flash(parsed.error.issues[0]?.message ?? "Could not publish this post.", false);
      return;
    }

    const trimmedCaption = caption.trim();
    const trimmedLocation = location.trim();
    const normalizedPollQuestion = pollQuestion.trim();
    const normalizedPollOptions = normalizePollOptions(pollOptions);
    setLoading(true);
    try {
      const mediaUrls: string[] = [...remoteMediaUrls];
      for (const file of files) {
        mediaUrls.push(await uploadUserMedia(file));
      }
      const collaboratorUsernames = taggedUsers.map((user) => user.username.toLowerCase());
      const seriesBody: Record<string, string> = {};
      if (albumSelect === ALBUM_NEW) {
        const t = newAlbumTitle.trim();
        if (t) seriesBody.newSeriesTitle = t;
      } else if (albumSelect !== ALBUM_NONE) {
        seriesBody.seriesId = albumSelect;
      }
      // Convert the local datetime input to an ISO 8601 string for the API.
      // Empty input ⇒ immediate publish (server treats `scheduledAt` as null).
      let scheduledAtIso: string | undefined;
      if (scheduleLocal.trim()) {
        const d = new Date(scheduleLocal);
        if (Number.isFinite(d.getTime()) && d.getTime() > Date.now()) {
          scheduledAtIso = d.toISOString();
        }
      }
      const r = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mediaUrls,
          mediaAltTexts: mediaUrls.map((_, i) => (mediaAltTexts[i] ?? "").trim()),
          caption: trimmedCaption || undefined,
          location: trimmedLocation || undefined,
          audience,
          allowComments,
          hideLikes,
          moderateComments: allowComments && moderateComments,
          collaboratorUsernames: collaboratorUsernames.length ? collaboratorUsernames : undefined,
          scheduledAt: scheduledAtIso,
          containsAdultContent,
          ...seriesBody,
          poll: withPoll
            ? {
                question: normalizedPollQuestion,
                options: normalizedPollOptions,
                durationHours: pollDurationHours,
              }
            : undefined,
        }),
      });
      if (!r.ok) {
        const errBody = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "Could not create the post.");
      }
      if (activeDraftId) {
        fetch(`/api/posts/draft/${activeDraftId}`, { method: "DELETE" }).catch(() => {});
      }
      flash(scheduledAtIso ? cs.flashScheduled : cs.flashPosted, true);
      setTimeout(() => router.push(scheduledAtIso ? "/drafts" : "/home"), 1400);
    } catch (e) { flash((e as Error).message, false); }
    finally { setLoading(false); }
  }

  async function handleSaveDraft() {
    const draftParsed = createPostDraftClientSchema.safeParse({
      caption,
      fileCount: files.length,
      remoteCount: remoteMediaUrls.length,
    });
    if (!draftParsed.success) {
      flash(draftParsed.error.issues[0]?.message ?? "Could not save draft.", false);
      return;
    }

    const trimmedCaption = caption.trim();
    setSavingDraft(true);
    try {
      const urls = [...remoteMediaUrls];
      for (const file of files) {
        urls.push(await uploadUserMedia(file));
      }
      const body = {
        caption: trimmedCaption || null,
        mediaUrls: urls,
        mediaAltTexts: urls.map((_, i) => (mediaAltTexts[i] ?? "")),
        audience,
      };
      const r = activeDraftId
        ? await fetch(`/api/posts/draft/${activeDraftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/posts/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = (await r.json().catch(() => null)) as { error?: string; draft?: { id: string } } | null;
      if (!r.ok) throw new Error(data?.error ?? "Could not save draft.");
      const id = data?.draft?.id as string | undefined;
      if (id) {
        const altsAligned = urls.map((_, i) => (mediaAltTexts[i] ?? ""));
        setActiveDraftId(id);
        setRemoteMediaUrls(urls);
        previews.forEach(URL.revokeObjectURL);
        setFiles([]);
        setPreviews([]);
        setMediaAltTexts(altsAligned);
        setActiveIdx(0);
        router.replace(`/create?draft=${encodeURIComponent(id)}`);
      }
      flash(cs.flashDraftSaved, true);
    } catch (e) {
      flash((e as Error).message, false);
    } finally {
      setSavingDraft(false);
    }
  }

  const initials = me?.displayName?.slice(0, 2).toUpperCase() ?? "??";
  const activeRatio = FORMATS.find(f => f.key === format)?.ratio ?? "1/1";
  const draftFromUrl = searchParams.get("draft");
  const headerTitle = draftBootloading
    ? cs.headerLoading
    : (draftFromUrl || activeDraftId)
      ? cs.headerEditing
      : cs.headerNew;

  return (
    <AppShell>
      <div className="st-root">

        {/* ── slim header ── */}
        <div className="st-header">
          <button className="st-back" onClick={() => router.back()} disabled={loading} aria-label={cs.goBack}>
            <IcArrowL />
          </button>
          <span className="st-title">{headerTitle}</span>
          <div className="st-header-spacer" />
        </div>

        {/* ── studio layout ── */}
        <div
          className={`st-studio${dragging ? " st-studio--over" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        >

          <CreateMediaCanvas
            previews={displayPreviews}
            activeIdx={activeIdx}
            setActiveIdx={setActiveIdx}
            isVideoAt={isVideoAt}
            format={format}
            setFormat={setFormat}
            activeRatio={activeRatio}
            fileRef={fileRef}
            removeFile={removeFile}
            dragging={dragging}
            cs={cs}
          />

          <div className="st-form-pane">

            <CreatePostPreview
              previews={displayPreviews}
              activeIdx={activeIdx}
              isVideoAt={isVideoAt}
              activeRatio={activeRatio}
              caption={caption}
              location={location}
              meDisplayName={me?.displayName}
              meUsername={me?.username}
              initials={initials}
            />

            {/* caption textarea */}
            <div className="st-caption-wrap">
              <textarea
                ref={textRef}
                className="st-caption"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={cs.captionPlaceholder}
                rows={4}
                maxLength={2200}
              />
              <div className="st-caption-bar">
                <div className="st-emojis">
                  {QUICK_EMOJIS.map(e => (
                    <button key={e} className="st-emoji" type="button"
                      onClick={() => { setCaption(p => p + e); textRef.current?.focus(); }}>
                      {e}
                    </button>
                  ))}
                  <button type="button" className="st-emoji st-emoji--ic"><IcSmile /></button>
                </div>
                <span className="st-charcount">{caption.length}/2200</span>
              </div>
            </div>

            {displayPreviews.length > 0 ? (
              <div className="st-caption-wrap">
                <p id={`st-alt-label-${activeIdx}`} className="st-field-label">
                  {cs.altLabel(activeIdx + 1, displayPreviews.length)}{" "}
                  <span className="st-field-label-note">{cs.altOptional}</span>
                </p>
                <textarea
                  className="st-caption"
                  aria-labelledby={`st-alt-label-${activeIdx}`}
                  value={mediaAltTexts[activeIdx] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMediaAltTexts((prev) => {
                      const next = [...prev];
                      while (next.length <= activeIdx) next.push("");
                      next[activeIdx] = v;
                      return next;
                    });
                  }}
                  placeholder={cs.altPlaceholder}
                  rows={2}
                  maxLength={2000}
                />
              </div>
            ) : null}

            <CreateMetadataFields
              location={location}
              setLocation={setLocation}
              cs={cs}
              tagPickerOpen={tagPickerOpen}
              setTagPickerOpen={setTagPickerOpen}
              tagQuery={tagQuery}
              setTagQuery={setTagQuery}
              tagSearching={tagSearching}
              tagResults={tagResults}
              taggedUsers={taggedUsers}
              addTaggedUser={addTaggedUser}
              removeTaggedUser={removeTaggedUser}
            />

            <CreatePollEditor
              variant="post"
              withPoll={withPoll}
              onTogglePoll={() => setWithPoll((value) => !value)}
              pollQuestion={pollQuestion}
              onPollQuestionChange={setPollQuestion}
              pollOptions={pollOptions}
              onPollOptionsChange={setPollOptions}
              pollDurationHours={pollDurationHours}
              onPollDurationHoursChange={setPollDurationHours}
            />

            <CreateAudiencePicker variant="post" value={audience} onChange={setAudience} />

            <div className="st-album">
              <p className="st-field-label">{cs.scheduleLabel}</p>
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                <input
                  type="datetime-local"
                  className="st-album-select"
                  value={scheduleLocal}
                  min={(() => {
                    const d = new Date(Date.now() + 60_000);
                    const pad = (n: number) => String(n).padStart(2, "0");
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()}
                  onChange={(e) => setScheduleLocal(e.target.value)}
                  style={{ flex: 1 }}
                  aria-label={cs.scheduleAria}
                />
                {scheduleLocal ? (
                  <button
                    type="button"
                    onClick={() => setScheduleLocal("")}
                    className="st-album-select"
                    style={{ width: "auto", padding: "0 .8rem" }}
                  >
                    {cs.scheduleClear}
                  </button>
                ) : null}
              </div>
              <p style={{ margin: ".35rem 0 0", color: "var(--muted)", fontSize: ".72rem" }}>
                {cs.scheduleHint}
              </p>
            </div>

            <div className="st-album">
              <p className="st-field-label">{cs.album}</p>
              <select
                className="st-album-select"
                value={albumSelect}
                onChange={(e) => setAlbumSelect(e.target.value)}
                aria-label={cs.albumAria}
              >
                <option value={ALBUM_NONE}>{cs.noAlbum}</option>
                {postSeriesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s._count.posts})
                  </option>
                ))}
                <option value={ALBUM_NEW}>{cs.newAlbum}</option>
              </select>
              {albumSelect === ALBUM_NEW ? (
                <input
                  type="text"
                  className="st-album-new st-field-in"
                  placeholder={cs.albumTitle}
                  value={newAlbumTitle}
                  onChange={(e) => setNewAlbumTitle(e.target.value)}
                  maxLength={200}
                />
              ) : null}
            </div>

            {/* toggles */}
            <div className="st-toggles">
              <Toggle label={cs.allowComments}
                desc={allowComments ? cs.allowCommentsOn : cs.allowCommentsOff}
                on={allowComments} onToggle={() => setAllowComments(v => !v)} />
              <Toggle
                label={cs.reviewComments}
                desc={
                  allowComments
                    ? (moderateComments ? cs.reviewOn : cs.reviewOff)
                    : cs.reviewNeedComments
                }
                on={moderateComments}
                onToggle={() => setModerateComments((v) => !v)}
                disabled={!allowComments}
              />
              <Toggle label={cs.hideLikes}
                desc={hideLikes ? cs.hideLikesOn : cs.hideLikesOff}
                on={hideLikes} onToggle={() => setHideLikes(v => !v)} />
            </div>

            {/* Adult-content toggle. The component renders null for under-18
                viewers, so the option only appears for 18+ authors — matching
                the server-side gate in `lib/age-gate.ts`. */}
            <div className="st-toggles" style={{ marginTop: 8 }}>
              <AdultContentToggle
                checked={containsAdultContent}
                onChange={setContainsAdultContent}
                hint="Marked posts are hidden from viewers under 18."
              />
            </div>

            {/* publish */}
            <div className="st-publish-area">
              <div className="st-post-meta">
                {displayPreviews.length > 0
                  ? <span>{cs.metaFiles(displayPreviews.length, FORMATS.find(f => f.key === format)?.label ?? "")}</span>
                  : <span>{caption.trim() ? cs.metaTextPost : cs.metaNoMedia}</span>
                }
              </div>
              <div className="st-publish-row">
                <button
                  type="button"
                  className="st-save-draft"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || loading || draftBootloading || (!caption.trim() && !files.length && !remoteMediaUrls.length)}
                >
                  {savingDraft ? <span className="st-spin"><IcLoader /></span> : null}
                  {savingDraft ? cs.savingDraft : cs.saveDraft}
                </button>
                <button
                  className="st-publish"
                  type="button"
                  onClick={handleShare}
                  disabled={
                    loading ||
                    savingDraft ||
                    draftBootloading ||
                    (!files.length && !caption.trim() && !remoteMediaUrls.length && !withPoll)
                  }
                >
                  {loading ? <span className="st-spin"><IcLoader /></span> : null}
                  {loading ? cs.publishing : cs.publishPost}
                </button>
              </div>
            </div>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => addFiles(e.target.files)} />

        {toast && (
          <div className={`st-toast${toast.ok ? " st-toast--ok" : " st-toast--err"}`}>
            {toast.ok ? <IcCheck /> : <IcX />}
            {toast.msg}
          </div>
        )}
      </div>

      <CreateScreenStyles />
    </AppShell>
  );
}
