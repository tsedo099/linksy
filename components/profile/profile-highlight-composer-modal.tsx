"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { NavIconClose } from "@/components/feed/feed-icons";
import { HIGHLIGHT_GRADS, type HighlightSourceStory } from "./profile-types";
import { IcPlay } from "./profile-icons";

export function HighlightComposerModal({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [stories, setStories] = useState<HighlightSourceStory[]>([]);
  const [step, setStep] = useState<"title" | "stories" | "cover">("title");
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [coverStoryId, setCoverStoryId] = useState<string>("");
  const [customCoverUrl, setCustomCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(true, dialogRef);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setStories([]);
    setSelectedStoryIds([]);
    setCoverStoryId("");
    setCustomCoverUrl(null);

    fetch(`/api/users/${userId}/stories/archive`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data?.stories)
          ? data.stories as HighlightSourceStory[]
          : [];
        setStories(items);
      })
      .catch(() => {
        if (active) setError("Could not load stories.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const storiesByMonth = useMemo(() => {
    const groups = new Map<string, HighlightSourceStory[]>();
    for (const story of stories) {
      const date = new Date(story.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const list = groups.get(key) ?? [];
      list.push(story);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a > b ? -1 : 1))
      .map(([key, items]) => {
        const [yearStr, monthStr] = key.split("-").map((value) => Number.parseInt(value, 10));
        const year = yearStr ?? new Date().getUTCFullYear();
        const month = monthStr;
        const label = new Date(year, (month || 1) - 1, 1).toLocaleString(undefined, {
          month: "long",
          year: "numeric",
        });
        return { key, label, items };
      });
  }, [stories]);

  const selectedStories = useMemo(
    () => stories.filter((story) => selectedStoryIds.includes(story.id)),
    [selectedStoryIds, stories],
  );

  useEffect(() => {
    if (selectedStoryIds.length === 0) {
      if (coverStoryId) setCoverStoryId("");
      return;
    }
    if (!coverStoryId || !selectedStoryIds.includes(coverStoryId)) {
      setCoverStoryId(selectedStoryIds[0] ?? "");
    }
  }, [coverStoryId, selectedStoryIds]);

  const toggleStory = (storyId: string) => {
    setSelectedStoryIds((current) => {
      if (current.includes(storyId)) {
        const next = current.filter((id) => id !== storyId);
        setCoverStoryId((prev) => (prev === storyId ? next[0] ?? "" : prev));
        return next;
      }
      const next = [...current, storyId];
      setCoverStoryId((prev) => (prev ? prev : storyId));
      return next;
    });
  };

  const canSubmitResolved = selectedStoryIds.length > 0 && Boolean(customCoverUrl || coverStoryId) && !saving && !loading && !created;
  const coverStory = stories.find((story) => story.id === coverStoryId) ?? selectedStories[0] ?? null;

  const storyDateBadge = (createdAt: string) => {
    const date = new Date(createdAt);
    return {
      day: date.getDate(),
      month: date.toLocaleString(undefined, { month: "short" }),
    };
  };

  const goToCoverStep = () => {
    if (selectedStoryIds.length === 0) return;
    if (!coverStoryId || !selectedStoryIds.includes(coverStoryId)) {
      setCoverStoryId(selectedStoryIds[0] ?? "");
    }
    setStep("cover");
  };

  const submit = async () => {
    if (!canSubmitResolved) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          storyIds: selectedStoryIds,
          coverStoryId: customCoverUrl ? undefined : coverStoryId,
          coverUrl: customCoverUrl ?? undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not create highlight.");
      }
      setCreated(true);
      await onCreated();
      window.setTimeout(onClose, 800);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create highlight.");
    } finally {
      setSaving(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadCover = async (file: File | null | undefined) => {
    if (!file) return;
    setUploadingCover(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "avatar");
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Cover upload failed.");
      }
      setCustomCoverUrl(data.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Cover upload failed.");
    } finally {
      setUploadingCover(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="pg-rel-overlay" onClick={onClose}>
      <section
        ref={dialogRef}
        className="pg-rel-modal pg-hc-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create highlight"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pg-rel-head">
          <h2>{step === "title" ? "New highlight" : step === "stories" ? "Stories" : "Select cover"}</h2>
          <button type="button" className="pg-rel-close" aria-label="Close" onClick={onClose}>
            <NavIconClose />
          </button>
        </header>

        <div className="pg-hc-body">
          {step === "title" ? (
            <div className="pg-hc-title-pane">
              <p className="pg-hc-hint">Give your highlight a name first.</p>
              <div className="pg-hc-title-wrap">
                <input
                  id="highlight-title"
                  className="pg-hc-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Travel 2026"
                  maxLength={40}
                  autoFocus
                />
                <span className="pg-hc-title-count">{title.length}/40</span>
              </div>
            </div>
          ) : step === "stories" ? (
            <>
              <div className="pg-hc-row-head">
                <p className="pg-hc-label">Stories</p>
                <span className="pg-hc-hint">{selectedStoryIds.length} selected</span>
              </div>

              {loading ? (
                <div className="pg-rel-empty">Loading stories...</div>
              ) : stories.length === 0 ? (
                <div className="pg-rel-empty">No stories found yet.</div>
              ) : (
                <div className="pg-hc-story-groups">
                  {storiesByMonth.map((group) => (
                    <div key={group.key} className="pg-hc-story-group">
                      <p className="pg-hc-group-label">{group.label}</p>
                      <div className="pg-hc-grid">
                        {group.items.map((story, idx) => {
                          const mediaUrl = getMediaUrl(story.mediaUrl);
                          const mediaSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : "";
                          const hasImage = isImageMediaUrl(mediaUrl);
                          const hasVideo = isVideoMediaUrl(mediaUrl);
                          const selected = selectedStoryIds.includes(story.id);
                          const badge = storyDateBadge(story.createdAt);
                          return (
                            <button
                              key={story.id}
                              type="button"
                              className={`pg-hc-story-card${selected ? " pg-hc-story-card--on" : ""}`}
                              onClick={() => toggleStory(story.id)}
                            >
                              {hasImage ? (
                                <Image
                                  src={mediaSrc}
                                  alt=""
                                  width={400}
                                  height={400}
                                  sizes="120px"
                                  className="pg-hc-story-card-media"
                                  unoptimized={shouldUnoptimizeNextImageSrc(mediaSrc)}
                                />
                              ) : hasVideo ? (
                                <span className="pg-hc-story-card-media pg-hc-story-card-media--video"><IcPlay /></span>
                              ) : (
                                <span
                                  className="pg-hc-story-card-media"
                                  style={{ background: HIGHLIGHT_GRADS[idx % HIGHLIGHT_GRADS.length] }}
                                >
                                  {story.caption?.trim().slice(0, 1).toUpperCase() || "S"}
                                </span>
                              )}
                              <span className="pg-hc-story-date">
                                <strong>{badge.day}</strong>
                                <small>{badge.month}</small>
                              </span>
                              <span className={`pg-hc-story-check${selected ? " pg-hc-story-check--on" : ""}`}>
                                {selected ? "✓" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pg-hc-cover-stage">
              <input
                ref={fileInputRef}
                type="file"
                className="pg-hc-upload-input"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => handleUploadCover(event.target.files?.[0])}
              />
              {coverStory ? (
                <>
                  <div className="pg-hc-row-head">
                    <p className="pg-hc-label">Select cover</p>
                    <span className="pg-hc-hint">{selectedStories.length} options</span>
                  </div>
                  <div className="pg-hc-upload-row">
                    <button
                      type="button"
                      className="pg-hc-upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingCover}
                    >
                      {uploadingCover ? "Uploading..." : "Upload cover image"}
                    </button>
                    {customCoverUrl && (
                      <button type="button" className="pg-hc-upload-btn pg-hc-upload-btn--ghost" onClick={() => setCustomCoverUrl(null)}>
                        Use story cover
                      </button>
                    )}
                  </div>
                  <div className="pg-hc-cover-preview-wrap">
                    {(() => {
                      if (customCoverUrl) {
                        const uploadedUrl = getMediaUrl(customCoverUrl);
                        const uploadedSrc = uploadedUrl ? (displayMediaSrc(uploadedUrl) ?? uploadedUrl) : "";
                        return (
                          <Image
                            src={uploadedSrc}
                            alt=""
                            width={800}
                            height={600}
                            sizes="(max-width: 640px) 100vw, 480px"
                            className="pg-hc-cover-preview"
                            unoptimized={shouldUnoptimizeNextImageSrc(uploadedSrc)}
                          />
                        );
                      }
                      const mediaUrl = getMediaUrl(coverStory.mediaUrl);
                      const previewSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : "";
                      const hasImage = isImageMediaUrl(mediaUrl);
                      const hasVideo = isVideoMediaUrl(mediaUrl);
                      if (hasImage) {
                        return (
                          <Image
                            src={previewSrc}
                            alt=""
                            width={800}
                            height={600}
                            sizes="(max-width: 640px) 100vw, 480px"
                            className="pg-hc-cover-preview"
                            unoptimized={shouldUnoptimizeNextImageSrc(previewSrc)}
                          />
                        );
                      }
                      if (hasVideo) {
                        return <div className="pg-hc-cover-preview pg-hc-cover-preview--icon"><IcPlay /></div>;
                      }
                      return <div className="pg-hc-cover-preview pg-hc-cover-preview--icon">Aa</div>;
                    })()}
                  </div>
                  <div className="pg-hc-cover-strip">
                    {selectedStories.map((story, idx) => {
                      const mediaUrl = getMediaUrl(story.mediaUrl);
                      const thumbSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : "";
                      const hasImage = isImageMediaUrl(mediaUrl);
                      const hasVideo = isVideoMediaUrl(mediaUrl);
                      return (
                        <button
                          key={story.id}
                          type="button"
                          className={`pg-hc-cover-item${!customCoverUrl && coverStoryId === story.id ? " pg-hc-cover-item--on" : ""}`}
                          onClick={() => {
                            setCustomCoverUrl(null);
                            setCoverStoryId(story.id);
                          }}
                        >
                          {hasImage ? (
                            <Image
                              src={thumbSrc}
                              alt=""
                              width={160}
                              height={160}
                              sizes="72px"
                              className="pg-hc-cover-thumb"
                              unoptimized={shouldUnoptimizeNextImageSrc(thumbSrc)}
                            />
                          ) : hasVideo ? (
                            <span className="pg-hc-cover-thumb pg-hc-cover-thumb--icon"><IcPlay /></span>
                          ) : (
                            <span className="pg-hc-cover-thumb" style={{ background: HIGHLIGHT_GRADS[idx % HIGHLIGHT_GRADS.length] }}>
                              {story.caption?.trim().slice(0, 1).toUpperCase() || "S"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="pg-rel-empty">Select stories first.</div>
              )}
            </div>
          )}

          {error && <p className="pg-follow-error">{error}</p>}
        </div>

        <footer className="pg-hc-actions">
          {step === "cover" ? (
            <button type="button" className="pg-act-btn" onClick={() => setStep("stories")} disabled={saving}>
              Back
            </button>
          ) : step === "stories" ? (
            <button type="button" className="pg-act-btn" onClick={() => setStep("title")} disabled={saving}>
              Back
            </button>
          ) : (
            <button type="button" className="pg-act-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          )}
          {step === "title" ? (
            <button
              type="button"
              className="pg-act-btn pg-act-btn--primary"
              onClick={() => setStep("stories")}
              disabled={!title.trim()}
            >
              Next
            </button>
          ) : step === "stories" ? (
            <button
              type="button"
              className="pg-act-btn pg-act-btn--primary"
              onClick={goToCoverStep}
              disabled={selectedStoryIds.length === 0}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className={`pg-act-btn pg-act-btn--primary${created ? " pg-hc-create-btn--done" : ""}`}
              onClick={submit}
              disabled={!canSubmitResolved}
            >
              {created ? (
                <span className="pg-hc-success-mark">Created ✓</span>
              ) : saving ? "Creating..." : "Create highlight"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
