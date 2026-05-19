"use client";

/**
 * IndexedDB-backed storage for the user's E2EE private keys + per-conversation
 * AES-GCM root keys. CryptoKey objects are stored via structured clone so the
 * private material never leaves the browser process — exporting requires
 * `extractable: true`, which we pass for ECDH/ECDSA keys but the underlying
 * bytes are never serialized to the network.
 *
 * Schema:
 *   `identity`     id="self" → { signingKeyPair, exchangeKeyPair, signedPreKey, oneTimePreKeys: { keyId: keypair } }
 *   `sessions`     id=conversationId → { rootKey, peerUserId, suite, createdAt }
 */

const DB_NAME = "linksy-e2ee";
const DB_VERSION = 1;
const IDENTITY_STORE = "identity";
const SESSIONS_STORE = "sessions";
const IDENTITY_KEY = "self";

export type StoredIdentity = {
  signingKeyPair: CryptoKeyPair;
  exchangeKeyPair: CryptoKeyPair;
  signedPreKey: { keyId: number; keyPair: CryptoKeyPair; createdAt: string };
  oneTimePreKeys: Record<number, CryptoKeyPair>;
};

export type StoredSession = {
  conversationId: string;
  peerUserId: string;
  rootKey: CryptoKey;
  suite: string;
  createdAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE);
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) db.createObjectStore(SESSIONS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB."));
  });
  return dbPromise;
}

function tx(
  storeName: string,
  mode: IDBTransactionMode,
): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  return openDb().then((db) => {
    const txn = db.transaction(storeName, mode);
    const store = txn.objectStore(storeName);
    const done = new Promise<void>((resolve, reject) => {
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error ?? new Error("IndexedDB transaction failed."));
      txn.onabort = () => reject(txn.error ?? new Error("IndexedDB transaction aborted."));
    });
    return { store, done };
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed."));
  });
}

// ---------- identity -------------------------------------------------------

export async function saveIdentity(identity: StoredIdentity): Promise<void> {
  const { store, done } = await tx(IDENTITY_STORE, "readwrite");
  store.put(identity, IDENTITY_KEY);
  await done;
}

export async function loadIdentity(): Promise<StoredIdentity | null> {
  const { store, done } = await tx(IDENTITY_STORE, "readonly");
  const result = (await reqAsPromise(store.get(IDENTITY_KEY))) as StoredIdentity | undefined;
  await done;
  return result ?? null;
}

export async function consumeOneTimePreKey(keyId: number): Promise<CryptoKeyPair | null> {
  const identity = await loadIdentity();
  if (!identity) return null;
  const pair = identity.oneTimePreKeys[keyId];
  if (!pair) return null;
  delete identity.oneTimePreKeys[keyId];
  await saveIdentity(identity);
  return pair;
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  const txn = db.transaction([IDENTITY_STORE, SESSIONS_STORE], "readwrite");
  txn.objectStore(IDENTITY_STORE).clear();
  txn.objectStore(SESSIONS_STORE).clear();
  await new Promise<void>((resolve, reject) => {
    txn.oncomplete = () => resolve();
    txn.onerror = () => reject(txn.error ?? new Error("Clear failed."));
  });
}

// ---------- sessions -------------------------------------------------------

export async function saveSession(session: StoredSession): Promise<void> {
  const { store, done } = await tx(SESSIONS_STORE, "readwrite");
  store.put(session, session.conversationId);
  await done;
}

export async function loadSession(conversationId: string): Promise<StoredSession | null> {
  const { store, done } = await tx(SESSIONS_STORE, "readonly");
  const result = (await reqAsPromise(store.get(conversationId))) as StoredSession | undefined;
  await done;
  return result ?? null;
}

export async function deleteSession(conversationId: string): Promise<void> {
  const { store, done } = await tx(SESSIONS_STORE, "readwrite");
  store.delete(conversationId);
  await done;
}
