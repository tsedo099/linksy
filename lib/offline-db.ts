"use client";

/**
 * Client-side IndexedDB wrapper for two offline concerns:
 *   1. GET response cache — feeds, profiles, etc. so the UI can render last-known
 *      data while the network is unavailable.
 *   2. Retry queue — mutating requests (POST/PUT/PATCH/DELETE) the user fired
 *      while offline; the service worker replays them on reconnect.
 *
 * The same IndexedDB database (`linksy-offline`) is shared with `public/sw.js`,
 * so the `retry-queue` store layout must stay in sync with the worker.
 */

const DB_NAME = "linksy-offline";
const DB_VERSION = 1;
const CACHE_STORE = "response-cache";
const QUEUE_STORE = "retry-queue";

export type CachedResponse<T = unknown> = {
  key: string;
  data: T;
  updatedAt: number;
  ttlMs: number | null;
};

export type QueuedRequest = {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  bodyType: "text" | "json";
  createdAt: number;
  attempts: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  if (!isAvailable()) return Promise.reject(new Error("IndexedDB unavailable"));
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const target = transaction.objectStore(store);
        let result: T;
        const out = run(target);
        if (out instanceof IDBRequest) {
          out.onsuccess = () => {
            result = out.result as T;
          };
          out.onerror = () => reject(out.error);
        } else {
          out.then((value) => {
            result = value;
          }).catch(reject);
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export async function readCache<T>(key: string): Promise<CachedResponse<T> | null> {
  if (!isAvailable()) return null;
  try {
    const value = await tx<CachedResponse<T> | undefined>(
      CACHE_STORE,
      "readonly",
      (store) => store.get(key) as IDBRequest<CachedResponse<T> | undefined>,
    );
    if (!value) return null;
    if (value.ttlMs !== null && Date.now() - value.updatedAt > value.ttlMs) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  key: string,
  data: T,
  ttlMs: number | null = null,
): Promise<void> {
  if (!isAvailable()) return;
  const entry: CachedResponse<T> = {
    key,
    data,
    updatedAt: Date.now(),
    ttlMs,
  };
  try {
    await tx<IDBValidKey>(CACHE_STORE, "readwrite", (store) => store.put(entry));
  } catch {
    /* best-effort cache */
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!isAvailable()) return;
  try {
    await tx<undefined>(CACHE_STORE, "readwrite", (store) => store.delete(key));
  } catch {
    /* best-effort */
  }
}

export async function clearCache(): Promise<void> {
  if (!isAvailable()) return;
  try {
    await tx<undefined>(CACHE_STORE, "readwrite", (store) => store.clear());
  } catch {
    /* best-effort */
  }
}

export async function enqueueRequest(item: Omit<QueuedRequest, "id" | "createdAt" | "attempts">): Promise<void> {
  if (!isAvailable()) throw new Error("IndexedDB unavailable");
  const record: Omit<QueuedRequest, "id"> = {
    ...item,
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx<IDBValidKey>(QUEUE_STORE, "readwrite", (store) => store.add(record));
}

export async function readQueue(): Promise<QueuedRequest[]> {
  if (!isAvailable()) return [];
  try {
    const items = await tx<QueuedRequest[]>(
      QUEUE_STORE,
      "readonly",
      (store) => store.getAll() as IDBRequest<QueuedRequest[]>,
    );
    return items || [];
  } catch {
    return [];
  }
}

export async function deleteQueueItem(id: number): Promise<void> {
  if (!isAvailable()) return;
  try {
    await tx<undefined>(QUEUE_STORE, "readwrite", (store) => store.delete(id));
  } catch {
    /* best-effort */
  }
}

export async function clearQueue(): Promise<void> {
  if (!isAvailable()) return;
  try {
    await tx<undefined>(QUEUE_STORE, "readwrite", (store) => store.clear());
  } catch {
    /* best-effort */
  }
}

export async function queueSize(): Promise<number> {
  if (!isAvailable()) return 0;
  try {
    return await tx<number>(QUEUE_STORE, "readonly", (store) => store.count());
  } catch {
    return 0;
  }
}
