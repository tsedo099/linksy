"use client";

/**
 * Browser-side WebRTC call helper. Pairs with:
 *   - POST /api/calls — start
 *   - GET/PATCH /api/calls/[id] — lifecycle
 *   - POST + GET(SSE) /api/calls/[id]/signal — SDP/ICE relay
 *   - GET /api/calls/ice-servers — STUN/TURN config
 *
 * The caller wires `onLocalStream`/`onRemoteStream` into <video> elements and
 * `onStateChange` to drive the UI (RINGING → ACCEPTED → ENDED, etc.).
 */

export type CallKind = "AUDIO" | "VIDEO";
export type CallStatus =
  | "RINGING"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED"
  | "MISSED"
  | "ENDED";

/**
 * Transport-layer health, surfaced separately from {@link CallStatus} so the UI
 * can show "Reconnecting…" without changing the persisted call lifecycle.
 */
export type CallConnectionState = "CONNECTING" | "STABLE" | "RECONNECTING" | "FAILED";

export type CallClientOptions = {
  callId: string;
  /** True for the side that ran POST /api/calls. Drives offer-vs-answer flow. */
  isInitiator: boolean;
  kind: CallKind;
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (status: CallStatus) => void;
  /** Fires on transport-level changes (e.g. ICE failed → restart in flight). */
  onConnectionStateChange?: (state: CallConnectionState) => void;
  /** Fires when recording starts / stops, so UI can show a REC indicator. */
  onRecordingStateChange?: (state: RecordingState) => void;
  onError?: (err: unknown) => void;
};

export type RecordingState =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "stopping" }
  | { kind: "uploading" }
  | { kind: "done"; url: string; durationSec: number; mimeType: string }
  | { kind: "error"; message: string };

/** How long to wait after `disconnected` before treating it as a real outage. */
const DISCONNECT_GRACE_MS = 2_000;
/** Cap the number of ICE-restart cycles per call so a doomed link doesn't loop forever. */
const ICE_RESTART_MAX_ATTEMPTS = 3;
/** Backoff between restart attempts. */
const ICE_RESTART_BACKOFF_MS = [0, 1_500, 4_000] as const;

type IceServersResponse = { iceServers: RTCIceServer[]; expiresAt: string | null };

async function fetchIceServers(): Promise<RTCIceServer[]> {
  const res = await fetch("/api/calls/ice-servers", { credentials: "include" });
  if (!res.ok) throw new Error(`ice-servers ${res.status}`);
  const data = (await res.json()) as IceServersResponse;
  return data.iceServers;
}

async function postSignal(
  callId: string,
  kind: "offer" | "answer" | "ice-candidate",
  payload: unknown,
): Promise<void> {
  await fetch(`/api/calls/${encodeURIComponent(callId)}/signal`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload }),
    keepalive: true,
  });
}

export class CallClient {
  private readonly opts: CallClientOptions;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private signalSource: EventSource | null = null;
  private status: CallStatus = "RINGING";
  private connectionState: CallConnectionState = "CONNECTING";
  /** ICE candidates received before remoteDescription is set, replayed on demand. */
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  /** Serializes handleIncomingSignal calls so back-to-back offers don't race. */
  private signalQueue: Promise<void> = Promise.resolve();
  /** Timer waiting out the disconnect grace period before triggering a restart. */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  /** True while a renegotiation is in flight (don't double-trigger). */
  private restartInFlight = false;
  private destroyed = false;

  /** Most recent remote stream — used by recording to merge into the mix. */
  private remoteStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private recorderChunks: BlobPart[] = [];
  /** AudioContext for mixing local + remote audio into a single track. */
  private recordAudioCtx: AudioContext | null = null;
  /** Combined MediaStream the MediaRecorder is writing from (so we can stop tracks on cleanup). */
  private recordStream: MediaStream | null = null;
  private recordStartedAt = 0;
  private recordingState: RecordingState = { kind: "idle" };

  constructor(opts: CallClientOptions) {
    this.opts = opts;
  }

  getRecordingState(): RecordingState {
    return this.recordingState;
  }

  private setRecordingState(next: RecordingState): void {
    this.recordingState = next;
    this.opts.onRecordingStateChange?.(next);
  }

  /** Read-only snapshot of the current connection-level state. */
  getConnectionState(): CallConnectionState {
    return this.connectionState;
  }

  private setConnectionState(next: CallConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    this.opts.onConnectionStateChange?.(next);
  }

  /** Connection recovered (ICE/connection went "connected") — cancel any pending restart. */
  private markStable(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartAttempts = 0;
    this.restartInFlight = false;
    this.setConnectionState("STABLE");
  }

  /**
   * Network blip detected. Wait out a short grace period (transient blips on
   * mobile networks are common) and then trigger ICE restart — but only from
   * the initiator side, to avoid both peers re-negotiating at once.
   */
  private scheduleIceRestart(reason: "connection-failed" | "disconnected" | "ice-failed"): void {
    if (this.destroyed) return;
    if (this.status !== "ACCEPTED") return; // pre-accept failures are just signaling problems
    if (this.restartInFlight) return;
    if (this.restartTimer) return;

    this.setConnectionState("RECONNECTING");

    // Grace period: skip it for hard "failed"/"ice-failed" since the connection
    // is already gone — for "disconnected" wait 2s in case the network swap
    // recovers naturally.
    const grace = reason === "disconnected" ? DISCONNECT_GRACE_MS : 0;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.destroyed) return;
      const pc = this.pc;
      if (!pc) return;
      // Maybe it recovered during the wait.
      if (pc.connectionState === "connected" || pc.iceConnectionState === "connected") {
        this.markStable();
        return;
      }
      void this.runIceRestart();
    }, grace);
  }

  private async runIceRestart(): Promise<void> {
    if (this.destroyed) return;
    const pc = this.pc;
    if (!pc) return;

    if (this.restartAttempts >= ICE_RESTART_MAX_ATTEMPTS) {
      this.setConnectionState("FAILED");
      this.opts.onError?.(new Error("ICE restart exhausted"));
      return;
    }

    this.restartInFlight = true;
    const attemptIndex = this.restartAttempts++;
    const backoff = ICE_RESTART_BACKOFF_MS[Math.min(attemptIndex, ICE_RESTART_BACKOFF_MS.length - 1)] ?? 0;
    if (backoff > 0) await new Promise((resolve) => setTimeout(resolve, backoff));
    if (this.destroyed) return;

    try {
      if (this.opts.isInitiator) {
        // Initiator drives renegotiation. The responder picks up the new offer
        // through the normal signal channel and answers — no extra wire.
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        await postSignal(this.opts.callId, "offer", offer);
      }
      // Recipients just wait for the new offer. If the recipient sees ICE fail
      // before the initiator does, mark reconnecting and keep waiting — the
      // initiator's failure detector will fire on its side and drive the flow.
    } catch (err) {
      this.restartInFlight = false;
      this.opts.onError?.(err);
      // Schedule another attempt unless we've hit the cap.
      if (this.restartAttempts < ICE_RESTART_MAX_ATTEMPTS) {
        this.scheduleIceRestart("ice-failed");
      } else {
        this.setConnectionState("FAILED");
      }
    }
  }

  /** Connect signaling SSE + acquire local media. Call this on both peers. */
  async connect(): Promise<void> {
    // Open the signal SSE FIRST — before fetching ICE servers, before
    // getUserMedia. State events (ACCEPTED / DECLINED / CANCELLED) flow
    // through this channel and DO NOT need pc to exist. If we wait for
    // ICE + media, the recipient could decline mid-setup and we'd never
    // hear about it — the caller's modal would stay on "Ringing…" forever.
    // The state handler doesn't touch pc; the SDP/ICE handlers do, but
    // they no-op cleanly when pc is null.
    this.openSignalChannel();

    const [iceServers] = await Promise.all([fetchIceServers()]);
    // Bail if the call ended (e.g. recipient declined) while we were
    // fetching ICE servers — no point setting up pc or asking for media.
    if (this.destroyed) return;
    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
    });

    this.pc.addEventListener("icecandidate", (ev) => {
      // Skip ICE candidate posts once the call has reached a terminal state —
      // the server will 409 them anyway (call is no longer RINGING/ACCEPTED)
      // and the console fills with red. teardown() flips `destroyed`, but
      // pc may still flush a few candidates after that on some browsers, so
      // the check guards each individual post.
      if (this.destroyed) return;
      if (ev.candidate) void postSignal(this.opts.callId, "ice-candidate", ev.candidate.toJSON());
    });
    this.pc.addEventListener("track", (ev) => {
      const stream = ev.streams[0];
      if (stream) {
        this.remoteStream = stream;
        this.opts.onRemoteStream?.(stream);
      }
    });
    this.pc.addEventListener("connectionstatechange", () => {
      const state = this.pc?.connectionState;
      if (state === "connected") {
        this.markStable();
      } else if (state === "closed") {
        // teardown will surface this through the lifecycle SSE
      } else if (state === "failed") {
        this.scheduleIceRestart("connection-failed");
      } else if (state === "disconnected") {
        this.scheduleIceRestart("disconnected");
      }
    });
    this.pc.addEventListener("iceconnectionstatechange", () => {
      const ice = this.pc?.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        this.markStable();
      } else if (ice === "failed") {
        // ICE-only failure can recover with restart even when connectionState still says "disconnected".
        this.scheduleIceRestart("ice-failed");
      }
    });

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.opts.kind === "VIDEO",
    });
    // Call might have ended (decline / cancel / timeout) while the user was
    // staring at the browser's permission prompt. Stop tracks we just got
    // so the OS mic/camera indicator clears, then bail.
    if (this.destroyed) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
      return;
    }
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }
    this.opts.onLocalStream?.(this.localStream);

    if (this.opts.isInitiator) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await postSignal(this.opts.callId, "offer", offer);
    }
  }

  /** Recipient action — accept the call. */
  async accept(): Promise<void> {
    if (this.status !== "RINGING") return;
    await this.patchAction("accept");
    // Move local status to ACCEPTED so the UI flips immediately. The server
    // also publishes ACCEPTED via the signal bus, but that arrives via SSE
    // and might miss us if our signal channel isn't open yet (getUserMedia
    // permission prompt is still blocking connect()). The signal-state
    // handler's `data.status !== this.status` guard makes a later SSE
    // delivery a no-op, so this is safe.
    if (this.status === "RINGING") {
      this.status = "ACCEPTED";
      this.opts.onStateChange?.("ACCEPTED");
    }
  }

  async decline(): Promise<void> {
    if (this.status === "RINGING") {
      await this.patchAction("decline");
    }
    this.finishLocally("DECLINED");
  }

  async cancel(): Promise<void> {
    if (this.status === "RINGING") {
      await this.patchAction("cancel");
    }
    this.finishLocally("CANCELLED");
  }

  async end(): Promise<void> {
    if (this.status === "ACCEPTED") {
      await this.patchAction("end");
    }
    this.finishLocally("ENDED");
  }

  /**
   * Drive the local lifecycle to a terminal state and tear down media + SSE.
   * Critical: onStateChange MUST fire BEFORE teardown closes the signal
   * channel — otherwise React never sees the terminal status and the
   * CallSurface stays open even though the call is over. (This was the
   * "call aa bolih ghr bolhgui" bug: PATCH succeeded server-side, but
   * teardown closed the SSE before the server's broadcast could reach us,
   * leaving the local `status` stuck on ACCEPTED/RINGING.)
   */
  private finishLocally(status: CallStatus): void {
    console.log(`[call-client] finishLocally(${status}) — prev status=${this.status} callId=${this.opts.callId}`);
    if (this.status !== status) {
      this.status = status;
      this.opts.onStateChange?.(status);
    }
    this.teardown();
  }

  /**
   * Mutex: at most one PATCH in flight at a time. Combined with the
   * `this.status` guards in the public methods, this catches the narrow
   * window where a second click lands before the SSE state event updates
   * `this.status`. Net effect: each terminal transition fires exactly one
   * PATCH instead of the 4+ retries we were seeing in dev logs.
   */
  private patchInFlight = false;
  private async patchAction(action: "accept" | "decline" | "cancel" | "end"): Promise<boolean> {
    if (this.patchInFlight) return false;
    this.patchInFlight = true;
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(this.opts.callId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // 409 = "call is in a different state than expected" — usually means the
      // other peer already terminated it. From OUR perspective the action is
      // still successful (the call IS over), so treat it as such.
      if (!res.ok && res.status !== 409) {
        console.warn(`[call-client] PATCH ${action} failed: ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[call-client] PATCH ${action} threw:`, err);
      return false;
    } finally {
      this.patchInFlight = false;
    }
  }

  private openSignalChannel(): void {
    const source = new EventSource(`/api/calls/${encodeURIComponent(this.opts.callId)}/signal`, {
      withCredentials: true,
    });

    source.addEventListener("state", (rawEvent) => {
      try {
        const data = JSON.parse((rawEvent as MessageEvent).data) as { status: CallStatus };
        console.log(`[call-client] state event received: ${data.status} (was=${this.status}) callId=${this.opts.callId}`);
        if (data.status && data.status !== this.status) {
          this.status = data.status;
          this.opts.onStateChange?.(data.status);
          if (data.status === "ENDED" || data.status === "DECLINED" || data.status === "CANCELLED" || data.status === "MISSED") {
            this.teardown();
          }
        }
      } catch (err) {
        this.opts.onError?.(err);
      }
    });

    source.addEventListener("signal", (rawEvent) => {
      try {
        const data = JSON.parse((rawEvent as MessageEvent).data) as {
          kind: "offer" | "answer" | "ice-candidate";
          payload: unknown;
        };
        // Serialize incoming SDP / ICE handling. Without this, two offers
        // arriving back-to-back (SSE replay, StrictMode double-subscribe)
        // would race against each other and the second would crash with
        // "Failed to set local answer sdp: Called in wrong state: stable"
        // because the first answer flow already returned pc to "stable".
        this.signalQueue = this.signalQueue
          .then(() => this.handleIncomingSignal(data.kind, data.payload))
          .catch((err) => this.opts.onError?.(err));
      } catch (err) {
        this.opts.onError?.(err);
      }
    });

    source.addEventListener("error", () => {
      // EventSource auto-reconnects with the `retry:` hint from the server.
    });

    this.signalSource = source;
  }

  private async handleIncomingSignal(
    kind: "offer" | "answer" | "ice-candidate",
    payload: unknown,
  ): Promise<void> {
    const pc = this.pc;
    if (!pc) return;

    if (kind === "offer") {
      // Valid states to accept an OFFER:
      //   - "stable"             — fresh negotiation
      //   - "have-remote-offer"  — duplicate of the same offer, harmless to re-apply
      //   - "have-local-pranswer"/"have-remote-pranswer" — partial answer flow
      // Anything else (e.g. "have-local-offer" — we sent our own offer) means
      // glare; ignore and let the existing negotiation complete.
      const state = pc.signalingState;
      if (state !== "stable" && state !== "have-remote-offer") {
        console.warn(`[call-client] dropping offer in signalingState=${state}`);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
      // setRemoteDescription should have moved us to "have-remote-offer".
      // If something else mutated the connection in the meantime (very
      // unlikely now that we serialize via signalQueue, but cheap to
      // guard), bail before createAnswer would crash.
      if (pc.signalingState !== "have-remote-offer") {
        console.warn(`[call-client] answer flow aborted — state went to ${pc.signalingState} after setRemoteDescription`);
        return;
      }
      await this.flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await postSignal(this.opts.callId, "answer", answer);
    } else if (kind === "answer") {
      // An ANSWER is only valid when we sent an offer and haven't applied a
      // response yet. The "stable" error this comment refers to happens when
      // a second answer (echo, ICE-restart race, double publish) arrives
      // after the first has moved us back to "stable" — silently skip.
      if (pc.signalingState !== "have-local-offer") {
        console.warn(`[call-client] dropping answer in signalingState=${pc.signalingState} (already applied or out of sync)`);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
      await this.flushPendingCandidates();
    } else if (kind === "ice-candidate") {
      const candidate = payload as RTCIceCandidateInit;
      if (!pc.remoteDescription) {
        this.pendingRemoteCandidates.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        this.opts.onError?.(err);
      }
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    while (this.pendingRemoteCandidates.length > 0) {
      const next = this.pendingRemoteCandidates.shift()!;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(next));
      } catch (err) {
        this.opts.onError?.(err);
      }
    }
  }

  /**
   * Start a client-side recording of the call. Captures local audio + remote
   * audio mixed into a single track; for video calls, also includes the remote
   * video track. The recording is held in memory until {@link stopRecording}
   * is called — at which point it is uploaded and the URL persisted on the
   * Call row.
   *
   * Throws if there is no remote stream yet (i.e. call not connected) or if
   * the browser lacks MediaRecorder support.
   */
  async startRecording(): Promise<void> {
    if (this.recorder) throw new Error("Already recording.");
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      throw new Error("Recording is not supported in this browser.");
    }
    const local = this.localStream;
    const remote = this.remoteStream;
    if (!local) throw new Error("No local stream to record.");
    if (!remote) throw new Error("Wait for the other person to connect before recording.");

    const mix = await this.buildRecordingStream(local, remote);
    const mime = pickRecordingMimeType(this.opts.kind);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mix, mime ? { mimeType: mime } : undefined);
    } catch (err) {
      // teardown audio context to free the device
      this.disposeRecordingStream();
      throw err instanceof Error ? err : new Error("Could not start recorder.");
    }

    this.recorderChunks = [];
    recorder.addEventListener("dataavailable", (ev) => {
      if (ev.data && ev.data.size > 0) this.recorderChunks.push(ev.data);
    });
    recorder.addEventListener("error", (ev) => {
      const err = (ev as Event & { error?: unknown }).error;
      this.opts.onError?.(err ?? new Error("Recorder error"));
    });
    recorder.start(2_000); // 2s chunks — bounded memory, lets us flush quickly on stop
    this.recorder = recorder;
    this.recordStartedAt = Date.now();
    this.setRecordingState({ kind: "recording", startedAt: this.recordStartedAt });
  }

  /**
   * Stop recording, upload the resulting blob, and persist `recordingUrl` on
   * the Call row. Resolves when the URL is saved; rejects on upload failure.
   */
  async stopRecording(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Not recording.");

    this.setRecordingState({ kind: "stopping" });
    const stopPromise = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    try {
      recorder.stop();
    } catch {
      /* already stopped */
    }
    await stopPromise;

    const mimeType = recorder.mimeType || "video/webm";
    const durationSec = Math.max(1, Math.round((Date.now() - this.recordStartedAt) / 1000));
    const blob = new Blob(this.recorderChunks, { type: mimeType });
    this.recorderChunks = [];
    this.recorder = null;
    this.disposeRecordingStream();

    this.setRecordingState({ kind: "uploading" });

    const ext = mimeTypeToExtension(mimeType);
    const filename = `call-${this.opts.callId}.${ext}`;
    const form = new FormData();
    form.append("file", new File([blob], filename, { type: mimeType }));
    form.append("purpose", "story");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Upload failed (${res.status}).`);
      }
      const data = (await res.json()) as { url?: string };
      const url = data.url;
      if (!url) throw new Error("Upload returned no URL.");

      // Persist on the call row so the recording shows up in history.
      await fetch(`/api/calls/${encodeURIComponent(this.opts.callId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attach-recording",
          recordingUrl: url,
          recordingMimeType: mimeType,
          recordingDurationSec: durationSec,
        }),
      }).catch(() => {
        // Upload succeeded — even if persist fails, surface success so the user
        // doesn't think the recording was lost.
      });

      this.setRecordingState({ kind: "done", url, durationSec, mimeType });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recording upload failed.";
      this.setRecordingState({ kind: "error", message });
      throw err;
    }
  }

  /**
   * Build the MediaStream the recorder writes to. Audio is mixed via Web Audio
   * (so both voices land in one track even though they originate on different
   * MediaStreams); video uses the remote track for the recorded perspective.
   */
  private async buildRecordingStream(local: MediaStream, remote: MediaStream): Promise<MediaStream> {
    const AudioCtor = typeof window.AudioContext !== "undefined"
      ? window.AudioContext
      : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) throw new Error("Web Audio is not supported in this browser.");
    const ctx = new AudioCtor();
    const destination = ctx.createMediaStreamDestination();
    for (const stream of [local, remote]) {
      if (stream.getAudioTracks().length === 0) continue;
      const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      src.connect(destination);
    }
    this.recordAudioCtx = ctx;

    const mixedTracks: MediaStreamTrack[] = [...destination.stream.getAudioTracks()];
    if (this.opts.kind === "VIDEO") {
      // Record the remote video — the local preview is rarely useful in the
      // captured artifact. If there's no remote video yet, fall back to local.
      const remoteVideo = remote.getVideoTracks()[0] ?? local.getVideoTracks()[0];
      if (remoteVideo) mixedTracks.push(remoteVideo);
    }
    const mix = new MediaStream(mixedTracks);
    this.recordStream = mix;
    return mix;
  }

  private disposeRecordingStream(): void {
    if (this.recordAudioCtx) {
      void this.recordAudioCtx.close().catch(() => undefined);
      this.recordAudioCtx = null;
    }
    if (this.recordStream) {
      // Only stop tracks we ourselves created — the underlying
      // local/remote MediaStreams keep their tracks alive for the call.
      // The destination stream's audio track was created here and is safe to stop.
      for (const track of this.recordStream.getAudioTracks()) {
        if (track.label === "MediaStreamAudioDestinationNode") track.stop();
      }
      this.recordStream = null;
    }
  }

  /** Idempotent — closes media tracks, peer connection and SSE source. */
  teardown(): void {
    this.destroyed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartInFlight = false;
    if (this.signalSource) {
      try {
        this.signalSource.close();
      } catch {
        /* ignore */
      }
      this.signalSource = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
  }
}

/** Best-effort MediaRecorder mime-type pick, narrowed by browser support. */
function pickRecordingMimeType(kind: CallKind): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return undefined;
  const candidates = kind === "VIDEO"
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (window.MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

function mimeTypeToExtension(mime: string): string {
  const base = (mime.split(";")[0] ?? mime).trim().toLowerCase();
  switch (base) {
    case "video/webm":
    case "audio/webm":
      return "webm";
    case "video/mp4":
    case "audio/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    default:
      return "webm";
  }
}

/** Convenience factory — POSTs /api/calls then returns a wired-up CallClient. */
export async function startCall(input: {
  conversationId: string;
  kind: CallKind;
  hooks?: Pick<CallClientOptions, "onLocalStream" | "onRemoteStream" | "onStateChange" | "onConnectionStateChange" | "onRecordingStateChange" | "onError">;
}): Promise<{ callId: string; client: CallClient }> {
  const res = await fetch("/api/calls", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: input.conversationId, kind: input.kind }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `start call ${res.status}`);
  }
  const data = (await res.json()) as { call: { id: string } };
  const client = new CallClient({ callId: data.call.id, isInitiator: true, kind: input.kind, ...input.hooks });
  await client.connect();
  return { callId: data.call.id, client };
}
