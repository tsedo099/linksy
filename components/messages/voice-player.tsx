"use client";

import React, { useEffect, useRef, useState } from "react";
import { displayMediaSrc } from "@/lib/media";
import { formatDuration } from "./types";
import { IcPause, IcPlay } from "./icons";

export function VoicePlayer({ src, peaks, variant, playLabel, pauseLabel }: {
  src: string;
  peaks: number[];
  variant: "me" | "them";
  playLabel: string;
  pauseLabel: string;
}) {
  const resolvedSrc = displayMediaSrc(src) ?? src;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = peaks.length > 0 ? peaks : new Array(24).fill(0.3);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
    };
    const onEnded = () => { setPlaying(false); setProgress(0); };
    const onLoaded = () => { if (Number.isFinite(audio.duration)) setDuration(audio.duration); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [resolvedSrc]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play().catch(() => { /* autoplay blocked */ }); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  }

  function handleSeek(event: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  const remainingSeconds = Math.max(0, duration - duration * progress);
  return (
    <div className={`ms-voice-player ms-voice-player--${variant}`}>
      <audio ref={audioRef} src={resolvedSrc} preload="metadata" />
      <button type="button" className="ms-voice-play" onClick={toggle} aria-label={playing ? pauseLabel : playLabel}>
        {playing ? <IcPause /> : <IcPlay />}
      </button>
      <div className="ms-voice-track" onClick={handleSeek}>
        {bars.map((peak, idx) => {
          const barProgress = idx / bars.length;
          const filled = barProgress < progress;
          return (
            <span
              key={idx}
              className={`ms-voice-bar${filled ? " ms-voice-bar--on" : ""}`}
              style={{ height: `${Math.max(15, Math.round(peak * 100))}%` }}
            />
          );
        })}
      </div>
      <span className="ms-voice-player-time">{formatDuration(remainingSeconds * 1000)}</span>
    </div>
  );
}
