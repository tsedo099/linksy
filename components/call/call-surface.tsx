"use client";

import { useEffect, useRef, useState } from "react";
import {
  CallClient,
  type CallConnectionState,
  type CallKind,
  type CallStatus,
  type RecordingState,
  startCall,
} from "@/lib/webrtc/call-client";
import { useFocusTrap } from "@/lib/use-focus-trap";

type Mode =
  | { kind: "outgoing"; conversationId: string; callKind: CallKind }
  | { kind: "incoming"; callId: string; callKind: CallKind };

type Props = {
  mode: Mode;
  /** Display name of the other party — purely cosmetic. */
  peerLabel?: string;
  /** Optional avatar URL — shown as a circle when video is off / before call connects. */
  peerAvatarUrl?: string | null;
  onClosed?: (finalStatus: CallStatus) => void;
};

const STATUS_LABELS: Record<CallStatus, string> = {
  RINGING: "Ringing…",
  ACCEPTED: "Connected",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  MISSED: "Missed",
  ENDED: "Call ended",
};

const CONNECTION_LABELS: Record<CallConnectionState, string> = {
  CONNECTING: "Connecting…",
  STABLE: "Connected",
  RECONNECTING: "Reconnecting…",
  FAILED: "Connection lost",
};

function initialsFor(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Minimal but production-ready call surface. Wires `CallClient` into two
 * `<video>` elements, exposes mute/camera/hangup controls, and surfaces
 * lifecycle in a header pill. Embed inside a modal/drawer in the messages
 * screen — this component does not own its z-index/overlay.
 */
export function CallSurface({ mode, peerLabel, peerAvatarUrl, onClosed }: Props) {
  const [status, setStatus] = useState<CallStatus>("RINGING");
  const [connectionState, setConnectionState] = useState<CallConnectionState>("CONNECTING");
  const [recordingState, setRecordingState] = useState<RecordingState>({ kind: "idle" });
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Call duration counter — ticks once ACCEPTED, frozen once status becomes
  // terminal. Independent of the parent so the timer doesn't drift if the
  // surface is unmounted briefly.
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (status === "ACCEPTED" && acceptedAt === null) setAcceptedAt(Date.now());
  }, [status, acceptedAt]);
  useEffect(() => {
    if (status !== "ACCEPTED") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);
  const durationSeconds = acceptedAt != null ? Math.max(0, Math.floor((now - acceptedAt) / 1000)) : 0;

  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const clientRef = useRef<CallClient | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Keep tab/shift+tab inside the call surface while a call is live — prevents
  // sighted-keyboard users from accidentally tabbing back into the feed.
  useFocusTrap(status === "RINGING" || status === "ACCEPTED", dialogRef);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hooks = {
      onLocalStream: (stream: MediaStream) => {
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        localStreamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
      },
      onRemoteStream: (stream: MediaStream) => {
        if (cancelled) return;
        if (remoteRef.current) remoteRef.current.srcObject = stream;
      },
      onStateChange: (next: CallStatus) => {
        if (cancelled) return;
        setStatus(next);
      },
      onConnectionStateChange: (next: CallConnectionState) => {
        if (cancelled) return;
        setConnectionState(next);
      },
      onRecordingStateChange: (next: RecordingState) => {
        if (cancelled) return;
        setRecordingState(next);
      },
      onError: (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      },
    };

    (async () => {
      try {
        if (mode.kind === "outgoing") {
          const { client } = await startCall({
            conversationId: mode.conversationId,
            kind: mode.callKind,
            hooks,
          });
          if (cancelled) {
            client.teardown();
            return;
          }
          clientRef.current = client;
        } else {
          const client = new CallClient({
            callId: mode.callId,
            isInitiator: false,
            kind: mode.callKind,
            ...hooks,
          });
          // Expose the client BEFORE awaiting connect(). connect() blocks on
          // the browser's mic/camera permission prompt — if we assign
          // clientRef AFTER the await, Accept/Decline are dead during the
          // prompt (clientRef.current?.accept() returns undefined). This was
          // the "awh boliulah n bolohgui" bug.
          clientRef.current = client;
          try {
            await client.connect();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            // Leave clientRef so the user can still hit Decline (the PATCH
            // path doesn't need media or the signal channel).
          }
          if (cancelled) {
            client.teardown();
            // Only clear clientRef if it STILL points to this client. In
            // React Strict Mode the first effect's cleanup runs synchronously
            // before the second effect runs — but our await connect() above
            // hasn't resolved yet, so by the time we reach this cancelled
            // branch the second effect has already assigned clientRef to its
            // own client. Unconditionally nulling it here would nuke the live
            // one and is what was breaking accept/decline.
            if (clientRef.current === client) {
              clientRef.current = null;
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      const existing = clientRef.current;
      if (existing) {
        existing.teardown();
        // Only null if no later effect already replaced clientRef. Same race
        // as above — Strict Mode's synchronous cleanup must not clobber the
        // newly-mounted effect's client.
        if (clientRef.current === existing) {
          clientRef.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "ACCEPTED" && status !== "RINGING") {
      console.log(`[call-surface] terminal status=${status} -> firing onClosed (parent should unmount)`);
      onClosed?.(status);
    }
  }, [status, onClosed]);

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    for (const track of stream.getVideoTracks()) track.enabled = !next;
    setCameraOff(next);
  }

  async function accept() {
    console.log("[call-surface] accept clicked, clientRef=", clientRef.current ? "ready" : "null");
    await clientRef.current?.accept().catch((err) => setError(String(err)));
  }
  async function decline() {
    console.log("[call-surface] decline clicked, clientRef=", clientRef.current ? "ready" : "null");
    await clientRef.current?.decline().catch((err) => setError(String(err)));
  }
  async function cancel() {
    console.log("[call-surface] cancel clicked, clientRef=", clientRef.current ? "ready" : "null");
    await clientRef.current?.cancel().catch((err) => setError(String(err)));
  }
  async function hangUp() {
    console.log("[call-surface] hangUp clicked, clientRef=", clientRef.current ? "ready" : "null");
    await clientRef.current?.end().catch((err) => setError(String(err)));
  }

  async function toggleRecording() {
    const client = clientRef.current;
    if (!client) return;
    setError(null);
    try {
      if (recordingState.kind === "recording") {
        await client.stopRecording();
      } else if (recordingState.kind === "idle" || recordingState.kind === "done" || recordingState.kind === "error") {
        await client.startRecording();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const isRecording = recordingState.kind === "recording";
  const recordingBusy = recordingState.kind === "stopping" || recordingState.kind === "uploading";

  const isVideo = mode.callKind === "VIDEO";
  const ringingButCalling = status === "RINGING" && mode.kind === "outgoing";
  const ringingIncoming = status === "RINGING" && mode.kind === "incoming";
  const showAvatar = !isVideo || cameraOff || status !== "ACCEPTED";
  const subline =
    status === "ACCEPTED"
      ? (connectionState !== "STABLE" ? CONNECTION_LABELS[connectionState] : formatDuration(durationSeconds))
      : STATUS_LABELS[status];

  // Hide the surface immediately when the call reaches a terminal state.
  // onClosed still fires from the useEffect above so the parent will unmount
  // us cleanly, but without this guard the user sees the ACCEPTED-state UI
  // (duration timer ticking on a dead call) for a render tick — they reported
  // it as "yarisn sec garj ired".
  if (status !== "RINGING" && status !== "ACCEPTED") {
    return null;
  }

  return (
    <div className="cs-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${isVideo ? "Video" : "Audio"} call with ${peerLabel ?? "user"}`}
        className={`cs-surface${isVideo ? " cs-surface--video" : " cs-surface--audio"}`}
      >
        {/* ── Video layer (always rendered, hidden when audio-only or camera off) ── */}
        {/* `pointer-events: none` when invisible is critical: this <video>
            is absolute-positioned at z-index:0 covering the WHOLE surface,
            so without it the (opacity: 0) element captures every click and
            the Accept/Decline buttons below it never fire. This was the
            actual "товч ажиллахгүй" bug — handlers were never blocked, the
            clicks just never reached them. */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="cs-remote-video"
          style={{
            opacity: isVideo && status === "ACCEPTED" ? 1 : 0,
            pointerEvents: isVideo && status === "ACCEPTED" ? "auto" : "none",
          }}
        />

        {/* ── Hero (avatar + name + status) ── */}
        {showAvatar && (
          <div className="cs-hero">
            <div className={`cs-avatar${ringingButCalling || ringingIncoming ? " cs-avatar--ringing" : ""}`}>
              {peerAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={peerAvatarUrl} alt="" className="cs-avatar-img" />
              ) : (
                <span className="cs-avatar-initials">{initialsFor(peerLabel ?? "?")}</span>
              )}
            </div>
            <h2 className="cs-peer-name">{peerLabel ?? "Linksy user"}</h2>
            <p className="cs-peer-status">
              {subline}
              {isRecording ? (
                <span className="cs-rec-inline">
                  <span className="cs-rec-dot" />
                  REC
                </span>
              ) : null}
              {recordingBusy ? (
                <span className="cs-rec-inline cs-rec-inline--busy">
                  {recordingState.kind === "uploading" ? "Uploading…" : "Finalising…"}
                </span>
              ) : null}
            </p>
            <div className="cs-kind-pill">{isVideo ? "Video call" : "Audio call"}</div>
          </div>
        )}

        {/* ── PiP local preview (video only, when on) ── */}
        {isVideo && status === "ACCEPTED" && !cameraOff && (
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            aria-label="Your camera preview"
            className="cs-local-video"
          />
        )}
        {(!isVideo || cameraOff || status !== "ACCEPTED") && (
          <video ref={localRef} autoPlay playsInline muted style={{ display: "none" }} />
        )}

        {error && (
          <div role="alert" className="cs-error">{error}</div>
        )}

        {/* ── Footer controls ── */}
        <footer className="cs-controls">
          {ringingIncoming ? (
            <>
              <button type="button" onClick={decline} className="cs-btn cs-btn--decline" aria-label="Decline call">
                <IcPhoneDown />
              </button>
              <button type="button" onClick={accept} className="cs-btn cs-btn--accept" aria-label="Accept call">
                <IcPhone />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? "Unmute" : "Mute"}
                className={`cs-btn cs-btn--secondary${muted ? " cs-btn--secondary-on" : ""}`}
              >
                {muted ? <IcMicOff /> : <IcMic />}
              </button>
              {isVideo && (
                <button
                  type="button"
                  onClick={toggleCamera}
                  aria-pressed={cameraOff}
                  aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
                  className={`cs-btn cs-btn--secondary${cameraOff ? " cs-btn--secondary-on" : ""}`}
                >
                  {cameraOff ? <IcCameraOff /> : <IcCamera />}
                </button>
              )}
              {status === "ACCEPTED" && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  aria-pressed={isRecording}
                  aria-label={isRecording ? "Stop recording" : "Record call"}
                  disabled={recordingBusy}
                  className={`cs-btn cs-btn--secondary${isRecording ? " cs-btn--rec-on" : ""}`}
                  title={isRecording ? "Stop recording" : "Record the call"}
                >
                  <IcRecord />
                </button>
              )}
              <button
                type="button"
                onClick={status === "ACCEPTED" ? hangUp : cancel}
                className="cs-btn cs-btn--decline"
                disabled={recordingBusy}
                aria-label={status === "ACCEPTED" ? "End call" : "Cancel call"}
              >
                <IcPhoneDown />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ── Inline icons ──────────────────────────────────────────────────────────── */
function IcPhone() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
function IcPhoneDown() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11l-1.27 1.27" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  );
}
function IcMic() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}
function IcMicOff() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8" />
    </svg>
  );
}
function IcCamera() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
    </svg>
  );
}
function IcCameraOff() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
    </svg>
  );
}
function IcRecord() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

if (typeof document !== "undefined" && !document.getElementById("call-surface-style")) {
  const style = document.createElement("style");
  style.id = "call-surface-style";
  style.textContent = `
    @keyframes csRingPulse {
      0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(124,58,237,.55); }
      70%  { transform: scale(1.03); box-shadow: 0 0 0 22px rgba(124,58,237,0); }
      100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(124,58,237,0); }
    }
    @keyframes csRecPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
    @keyframes csFadeIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }

    .cs-overlay {
      position: fixed; inset: 0;
      background: rgba(2, 6, 23, .82);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      z-index: 1200;
      display: flex; align-items: center; justify-content: center;
      padding: 1.2rem;
    }
    .cs-surface {
      position: relative;
      width: 100%;
      max-width: 480px;
      min-height: 560px;
      max-height: 90vh;
      background: linear-gradient(160deg, #16092e 0%, #0a0a14 65%);
      color: #f5edff;
      border: 1px solid rgba(168, 85, 247, .18);
      border-radius: 28px;
      padding: 2.2rem 1.6rem 1.6rem;
      display: flex; flex-direction: column; align-items: center;
      gap: 1rem;
      box-shadow: 0 30px 70px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset;
      overflow: hidden;
      animation: csFadeIn .22s ease;
    }
    .cs-surface--video { max-width: 720px; min-height: 600px; padding: 0; }

    /* Remote video sits behind everything when video call active */
    .cs-remote-video {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      background: #000;
      transition: opacity .25s ease;
      z-index: 0;
    }
    .cs-surface--video .cs-hero { z-index: 1; padding-top: 2.4rem; }
    .cs-surface--video .cs-controls { z-index: 2; padding: 1rem 1.4rem 1.6rem; }

    .cs-hero {
      display: flex; flex-direction: column; align-items: center;
      gap: .6rem; flex: 1; padding-top: 1rem;
      position: relative;
      z-index: 1;
    }
    .cs-controls { position: relative; z-index: 2; }
    .cs-avatar {
      width: 132px; height: 132px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
      border: 3px solid rgba(255, 255, 255, .12);
      box-shadow: 0 0 36px rgba(124, 58, 237, .35);
    }
    .cs-surface--video .cs-avatar {
      border-color: rgba(255,255,255,.32);
      box-shadow: 0 0 40px rgba(0,0,0,.45);
    }
    .cs-avatar--ringing { animation: csRingPulse 2s infinite; }
    .cs-avatar-img { width: 100%; height: 100%; object-fit: cover; }
    .cs-avatar-initials {
      font-size: 2.6rem; font-weight: 700; color: #fff;
      font-family: var(--font-headline, system-ui);
      letter-spacing: -.02em;
    }
    .cs-peer-name {
      margin: .85rem 0 0; font-size: 1.6rem; font-weight: 700;
      letter-spacing: -.01em;
      text-align: center;
      text-shadow: 0 2px 12px rgba(0,0,0,.4);
    }
    .cs-peer-status {
      margin: 0; font-size: .98rem; color: #d8b4fe;
      font-variant-numeric: tabular-nums;
      display: inline-flex; align-items: center; gap: .55rem;
      text-shadow: 0 1px 6px rgba(0,0,0,.4);
    }
    .cs-kind-pill {
      margin-top: .6rem;
      padding: .26rem .8rem;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #e9d5ff;
    }
    .cs-rec-inline {
      display: inline-flex; align-items: center; gap: .35rem;
      padding: .18rem .5rem;
      background: rgba(239, 68, 68, .2);
      color: #fca5a5;
      border-radius: 999px;
      font-size: .68rem; font-weight: 700; letter-spacing: .06em;
    }
    .cs-rec-inline--busy { background: rgba(124, 58, 237, .22); color: #d8b4fe; }
    .cs-rec-dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: csRecPulse 1.2s infinite; }

    .cs-local-video {
      position: absolute;
      right: 1.2rem; bottom: 6.2rem;
      width: 108px; height: 144px;
      object-fit: cover;
      border-radius: 14px;
      border: 2px solid rgba(255,255,255,.22);
      background: #111;
      box-shadow: 0 10px 24px rgba(0,0,0,.5);
      z-index: 2;
    }

    .cs-error {
      margin: 0 1rem;
      color: #fca5a5;
      font-size: .85rem;
      text-align: center;
      padding: .5rem .8rem;
      background: rgba(239,68,68,.1);
      border: 1px solid rgba(239,68,68,.25);
      border-radius: 10px;
    }

    .cs-controls {
      display: flex; gap: 1.1rem;
      justify-content: center; align-items: center;
      width: 100%;
      padding-top: .4rem;
    }
    .cs-btn {
      width: 60px; height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      color: #fff;
      transition: transform .14s ease, background-color .18s ease, box-shadow .18s ease;
    }
    .cs-btn:hover:not(:disabled) { transform: scale(1.06); }
    .cs-btn:active:not(:disabled) { transform: scale(.96); }
    .cs-btn:disabled { opacity: .5; cursor: not-allowed; }

    .cs-btn--secondary {
      background: rgba(255,255,255,.12);
      backdrop-filter: blur(6px);
    }
    .cs-btn--secondary:hover:not(:disabled) { background: rgba(255,255,255,.18); }
    .cs-btn--secondary-on {
      background: #fff;
      color: #1a0f35;
    }
    .cs-btn--secondary-on:hover:not(:disabled) { background: #fff; opacity: .92; }

    .cs-btn--rec-on {
      background: #ef4444 !important;
      color: #fff !important;
      animation: csRecPulse 1.4s infinite;
    }

    .cs-btn--accept {
      width: 72px; height: 72px;
      background: #22c55e;
      box-shadow: 0 8px 24px rgba(34,197,94,.4);
    }
    .cs-btn--accept:hover:not(:disabled) { background: #16a34a; }

    .cs-btn--decline {
      width: 72px; height: 72px;
      background: #ef4444;
      box-shadow: 0 8px 24px rgba(239,68,68,.4);
    }
    .cs-btn--decline:hover:not(:disabled) { background: #dc2626; }

    @media (max-width: 520px) {
      .cs-surface { max-width: 100%; min-height: calc(100vh - 2.4rem); border-radius: 22px; }
      .cs-avatar { width: 116px; height: 116px; }
      .cs-peer-name { font-size: 1.4rem; }
      .cs-btn { width: 56px; height: 56px; }
      .cs-btn--accept, .cs-btn--decline { width: 64px; height: 64px; }
      .cs-local-video { width: 92px; height: 122px; right: .9rem; bottom: 5.4rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cs-avatar--ringing, .cs-btn--rec-on, .cs-rec-dot { animation: none; }
      .cs-surface { animation: none; }
      .cs-btn:hover:not(:disabled) { transform: none; }
    }
  `;
  document.head.appendChild(style);
}
