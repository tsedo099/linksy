"use client";

import { useEffect, useState } from "react";
import type { DigestCadence, ServerNotifPrefs } from "./types";

export function formatUploadSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)}MB`;
}

export function useStoredState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        setState(JSON.parse(raw) as T);
      }
    } catch {
      // Ignore invalid local storage payloads.
    } finally {
      setReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage write failures and keep the current in-memory state.
    }
  }, [key, ready, state]);

  return [state, setState] as const;
}

export function useStoredToggleList(key: string, count: number, defaultValue = true) {
  const initial = Array.from({ length: count }, () => defaultValue);
  const [state, setState] = useStoredState<boolean[]>(key, initial);
  const normalized = state.length === count ? state : initial.map((value, index) => state[index] ?? value);

  useEffect(() => {
    if (state.length !== count) {
      setState(normalized);
    }
  }, [count, normalized, setState, state.length]);

  return [normalized, setState] as const;
}

export const DEFAULT_NOTIF_PREFS: ServerNotifPrefs = {
  like: true,
  comment: true,
  follow: true,
  mention: true,
  story: true,
  message: true,
  friendJoined: true,
};

export const DIGEST_OPTIONS: ReadonlyArray<{ value: DigestCadence; label: string; desc: string }> = [
  { value: "off",    label: "Off",        desc: "Do not send the digest." },
  { value: "daily",  label: "Daily",      desc: "Once each day with what you missed." },
  { value: "weekly", label: "Weekly",     desc: "A Monday summary of the past week." },
];

export const DEFAULT_QH_START = 22 * 60;
export const DEFAULT_QH_END = 7 * 60;

export function minutesToTimeInput(m: number): string {
  const hours = Math.floor(m / 60).toString().padStart(2, "0");
  const minutes = (m % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function parseTimeInput(s: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const hh = Number.parseInt(match[1] ?? "0", 10);
  const mm = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function formatLastSent(iso: string | null): string {
  if (!iso) return "Never sent.";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never sent.";
  return `Last sent ${date.toLocaleString()}`;
}

export function describeUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: "Unknown device", browser: "Unknown browser" };
  let device = "Desktop";
  if (/iPad|iPhone|iPod/.test(ua)) device = /iPad/.test(ua) ? "iPad" : "iPhone";
  else if (/Android/i.test(ua)) device = /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  else if (/Mac OS X/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua)) device = "Windows";
  else if (/Linux/.test(ua)) device = "Linux";

  let browser = "Web";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";
  else if (/Firefox\//.test(ua)) browser = "Firefox";

  return { device, browser };
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const OAUTH_SCOPE_CHOICES = ["profile:read", "posts:read", "posts:write", "media:upload", "notifications:read"] as const;
