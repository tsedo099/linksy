"use client";

import {
  enqueueRequest,
  readCache,
  writeCache,
  type QueuedRequest,
} from "@/lib/offline-db";

export type OfflineFetchOptions = RequestInit & {
  /** Override cache key. Defaults to method + url. */
  cacheKey?: string;
  /** TTL for cached GETs in ms. Null disables expiry. */
  ttlMs?: number | null;
  /** Skip cache lookup entirely. */
  noCache?: boolean;
  /** Queue mutating requests when offline. Default true. */
  queueWhenOffline?: boolean;
};

export type OfflineFetchResult<T> = {
  data: T;
  source: "network" | "cache" | "queued";
  status: number;
  queued: boolean;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function methodOf(init: RequestInit | undefined): string {
  return (init?.method || "GET").toUpperCase();
}

function buildCacheKey(url: string, init: RequestInit | undefined, override: string | undefined): string {
  if (override) return override;
  return `${methodOf(init)} ${url}`;
}

async function bodyToString(body: BodyInit | null | undefined): Promise<{ value: string | null; type: "text" | "json" }> {
  if (body === null || body === undefined) return { value: null, type: "text" };
  if (typeof body === "string") return { value: body, type: "text" };
  if (body instanceof Blob) return { value: await body.text(), type: "text" };
  if (body instanceof ArrayBuffer) return { value: new TextDecoder().decode(body), type: "text" };
  if (ArrayBuffer.isView(body)) {
    return { value: new TextDecoder().decode(body as ArrayBufferView), type: "text" };
  }
  if (body instanceof URLSearchParams) return { value: body.toString(), type: "text" };
  if (body instanceof FormData) {
    const obj: Record<string, string> = {};
    body.forEach((value, key) => {
      if (typeof value === "string") obj[key] = value;
    });
    return { value: JSON.stringify(obj), type: "json" };
  }
  return { value: JSON.stringify(body), type: "json" };
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...(headers as Record<string, string>) };
}

async function notifyServiceWorker(payload: Omit<QueuedRequest, "id" | "createdAt" | "attempts">): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => null);
  const target = reg?.active || navigator.serviceWorker.controller;
  if (!target) return false;
  target.postMessage({ type: "QUEUE_REQUEST", payload });
  return true;
}

/**
 * Online-first fetcher with IndexedDB fallback for GETs and a retry queue for
 * mutations. Reads cache when offline; queues mutating requests so the service
 * worker replays them on reconnect.
 */
export async function offlineFetch<T = unknown>(
  url: string,
  init: OfflineFetchOptions = {},
): Promise<OfflineFetchResult<T>> {
  const method = methodOf(init);
  const cacheKey = buildCacheKey(url, init, init.cacheKey);
  const isMutation = MUTATING_METHODS.has(method);

  if (!isMutation && isOnline()) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        const data = (await response.clone().json().catch(() => undefined)) as T | undefined;
        if (data !== undefined && !init.noCache) {
          await writeCache<T>(cacheKey, data, init.ttlMs ?? null);
        }
        return {
          data: (data as T) ?? ((await response.json().catch(() => null)) as T),
          source: "network",
          status: response.status,
          queued: false,
        };
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (!init.noCache) {
        const cached = await readCache<T>(cacheKey);
        if (cached) {
          return { data: cached.data, source: "cache", status: 200, queued: false };
        }
      }
      throw error;
    }
  }

  if (!isMutation) {
    const cached = await readCache<T>(cacheKey);
    if (cached) return { data: cached.data, source: "cache", status: 200, queued: false };
    throw new Error("offline-no-cache");
  }

  const queueWhenOffline = init.queueWhenOffline !== false;
  if (isOnline()) {
    const response = await fetch(url, init);
    const data = (await response.json().catch(() => null)) as T;
    return { data, source: "network", status: response.status, queued: false };
  }

  if (!queueWhenOffline) {
    throw new Error("offline");
  }

  const { value, type } = await bodyToString(init.body as BodyInit | null | undefined);
  const headers = headersToObject(init.headers);
  if (type === "json" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const payload = { url, method, headers, body: value, bodyType: type };
  const delegated = await notifyServiceWorker(payload);
  if (!delegated) {
    await enqueueRequest(payload);
  }

  return {
    data: { queued: true } as unknown as T,
    source: "queued",
    status: 202,
    queued: true,
  };
}

/** Convenience wrapper that returns just the parsed body. */
export async function offlineJson<T = unknown>(
  url: string,
  init: OfflineFetchOptions = {},
): Promise<T> {
  const result = await offlineFetch<T>(url, init);
  return result.data;
}
