// IndexedDB storage layer — unlimited storage for large estimate data (PDFs, images).
// Async API: get(key) → { value } | undefined, set(key, value), delete(key)
// Keys: bldg-index, bldg-est-{id}, bldg-master, bldg-ideas, bldg-settings

const DB_NAME = "bldg-estimator";
const DB_VERSION = 1;
const STORE_NAME = "kv";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Migrate any existing localStorage data to IndexedDB on first run
async function migrateFromLocalStorage(db) {
  const migrated = localStorage.getItem("bldg-idb-migrated");
  if (migrated) return;

  const keys = [];
  // Collect bldg-* keys EXCEPT bldg-session-token — that must stay in
  // localStorage for single-session enforcement (useSessionAwareness polls it).
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("bldg-") && key !== "bldg-session-token") keys.push(key);
  }

  if (keys.length > 0) {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const key of keys) {
      const val = localStorage.getItem(key);
      if (val) store.put(val, key);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    // Clean up localStorage after migration
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem("bldg-idb-migrated", "1");
}

let dbPromise = null;

// Request persistent storage so the browser never silently evicts IDB data.
// Without this, deploys that bust the HTML cache can trigger browser storage
// cleanup — wiping all drawings, estimates, etc.
let _persistRequested = false;
async function requestPersistentStorage() {
  if (_persistRequested) return;
  _persistRequested = true;
  try {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      console.log(`[storage] Persistent storage ${granted ? "granted ✓" : "denied — data may be evicted"}`);
    }
  } catch (e) {
    console.warn("[storage] navigator.storage.persist() failed:", e);
  }
}

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB().then(async db => {
      await migrateFromLocalStorage(db);
      // Fire-and-forget — don't block DB init on the permission prompt
      requestPersistentStorage();
      return db;
    });
  }
  return dbPromise;
}

export const storage = {
  async get(key) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          resolve(req.result !== undefined ? { value: req.result } : undefined);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error("Storage get error:", e);
      return undefined;
    }
  },

  async set(key, value) {
    try {
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(typeof value === "string" ? value : JSON.stringify(value), key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) {
      console.error("Storage set error:", e);
      return false;
    }
  },

  async delete(key) {
    try {
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) {
      console.error("Storage delete error:", e);
      return false;
    }
  },

  async clearAll() {
    try {
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) {
      console.error("Storage clearAll error:", e);
      return false;
    }
  },

  // Return all keys in the store (for migration purposes)
  async keys() {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error("Storage keys error:", e);
      return [];
    }
  },

  async getUsage() {
    try {
      if (navigator.storage?.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        return { usage, quota, pctUsed: Math.round((usage / quota) * 100) };
      }
      return null;
    } catch {
      return null;
    }
  },
};
