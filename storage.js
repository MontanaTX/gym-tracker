// Tiny key-value store: IndexedDB first, localStorage fallback.
const DB = 'gym-tracker', STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet(key) {
  try {
    const v = await idb('readonly', s => s.get(key));
    return v === undefined ? null : v;
  } catch {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }
}

export async function kvSet(key, value) {
  try {
    await idb('readwrite', s => s.put(value, key));
  } catch {
    localStorage.setItem(key, JSON.stringify(value)); // throws visibly if this also fails
  }
}
