/* Linksy service worker.
 *
 * Two responsibilities:
 *   1. Web Push (notifications) — registered from the client when push is enabled
 *      (see /api/push/public-key + lib/push-client.ts).
 *   2. Offline mode — precache the app shell, runtime-cache GET responses, and
 *      replay queued mutating requests (POST/PUT/PATCH/DELETE) once back online
 *      via the Background Sync API.
 */

const SW_VERSION = "linksy-sw-v2";
const PRECACHE = `${SW_VERSION}-precache`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const API_CACHE = `${SW_VERSION}-api`;
const RETRY_QUEUE_DB = "linksy-offline";
const RETRY_QUEUE_STORE = "retry-queue";
const SYNC_TAG = "linksy-replay-queue";
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  "/",
  "/offline",
  "/manifest.json",
  "/psda.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(SW_VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "QUEUE_REQUEST" && data.payload) {
    event.waitUntil(
      enqueueRequest(data.payload)
        .then(() => requestSync())
        .then(() => notifyClients({ type: "QUEUE_UPDATED" }))
        .catch(() => undefined),
    );
  } else if (data.type === "FLUSH_QUEUE") {
    event.waitUntil(replayQueue().then(() => notifyClients({ type: "QUEUE_UPDATED" })));
  } else if (data.type === "GET_QUEUE_SIZE") {
    event.waitUntil(
      countQueue().then((size) => {
        if (event.source && "postMessage" in event.source) {
          event.source.postMessage({ type: "QUEUE_SIZE", size });
        }
      }),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Next.js dev (Turbopack) rewrites chunks constantly; cache-first on /_next/ causes
   * stale graphs and errors like "react-window module factory is not available". */
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (isLoopback && url.pathname.startsWith("/_next/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApi(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue().then(() => notifyClients({ type: "QUEUE_UPDATED" })));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Linksy", body: "", url: "/notifications", tag: "linksy", category: "alerting" };
  try {
    if (event.data) {
      Object.assign(data, event.data.json());
    }
  } catch {
    /* use defaults */
  }

  const isSilent = data.category === "silent";

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      data: { url: data.url },
      icon: "/psda.png",
      badge: "/psda.png",
      // Silent pushes don't ring/vibrate but still show in the tray.
      silent: isSilent,
      vibrate: isSilent ? undefined : [120, 60, 120],
      // Group passive activity under one toast (replaces previous of same tag).
      renotify: !isSilent,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (url && typeof url === "string") {
    event.waitUntil(self.clients.openWindow(url));
  }
});

function isStaticAsset(pathname) {
  return /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i.test(
    pathname,
  );
}

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function handleApi(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.status === 200) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: appendOfflineHeader(cached.headers),
      });
    }
    return new Response(
      JSON.stringify({ error: "offline", offline: true }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "X-From-Cache": "miss" },
      },
    );
  }
}

function appendOfflineHeader(headers) {
  const next = new Headers(headers);
  next.set("X-From-Cache", "hit");
  return next;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => undefined);
    return fresh;
  } catch {
    if (cached) return cached;
    return new Response("", { status: 504 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => undefined);
  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

/* ---------- IndexedDB-backed retry queue ---------- */

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RETRY_QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RETRY_QUEUE_STORE)) {
        db.createObjectStore(RETRY_QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(db, mode) {
  return db.transaction(RETRY_QUEUE_STORE, mode).objectStore(RETRY_QUEUE_STORE);
}

async function enqueueRequest(payload) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RETRY_QUEUE_STORE, "readwrite");
    tx.objectStore(RETRY_QUEUE_STORE).add({
      url: payload.url,
      method: payload.method,
      headers: payload.headers || {},
      body: payload.body ?? null,
      bodyType: payload.bodyType || "text",
      createdAt: Date.now(),
      attempts: 0,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readAllQueued() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const req = txStore(db, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueued(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RETRY_QUEUE_STORE, "readwrite");
    tx.objectStore(RETRY_QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function bumpAttempts(item) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RETRY_QUEUE_STORE, "readwrite");
    tx.objectStore(RETRY_QUEUE_STORE).put({ ...item, attempts: (item.attempts || 0) + 1 });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function countQueue() {
  const items = await readAllQueued().catch(() => []);
  return items.length;
}

async function requestSync() {
  if ("sync" in self.registration) {
    try {
      await self.registration.sync.register(SYNC_TAG);
      return;
    } catch {
      /* fall through to immediate replay */
    }
  }
  await replayQueue();
}

async function replayQueue() {
  const items = await readAllQueued().catch(() => []);
  for (const item of items) {
    try {
      const init = {
        method: item.method,
        headers: item.headers || {},
      };
      if (item.body !== null && item.body !== undefined) {
        init.body = item.body;
      }
      const response = await fetch(item.url, init);
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await deleteQueued(item.id);
      } else {
        await bumpAttempts(item);
        if ((item.attempts || 0) + 1 >= 5) {
          await deleteQueued(item.id);
        }
      }
    } catch {
      await bumpAttempts(item).catch(() => undefined);
      if ((item.attempts || 0) + 1 >= 5) {
        await deleteQueued(item.id).catch(() => undefined);
      }
    }
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}
