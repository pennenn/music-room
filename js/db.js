// 端末内の保存先：曲の情報・プレイリスト・再生履歴は IndexedDB、音声ファイルは OPFS（アプリ専用の領域）
const DB_NAME = "music-room";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("tracks", { keyPath: "key" });
      db.createObjectStore("playlists", { keyPath: "id" });
      db.createObjectStore("plays", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = "readonly") {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function all(name) { return wrap((await store(name)).getAll()); }
export async function get(name, key) { return wrap((await store(name)).get(key)); }
export async function put(name, value) { return wrap((await store(name, "readwrite")).put(value)); }
export async function del(name, key) { return wrap((await store(name, "readwrite")).delete(key)); }
export async function putMany(name, values) {
  const db = await open();
  const tx = db.transaction(name, "readwrite");
  const st = tx.objectStore(name);
  for (const v of values) st.put(v);
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

export async function getMeta(k, def = null) {
  const r = await get("meta", k);
  return r ? r.v : def;
}
export async function setMeta(k, v) { return put("meta", { k, v }); }

// ---------- OPFS（音声ファイルとアートワーク）
// Android アプリ版では、ファイルはアプリの保存領域にあり、https://appassets.androidplatform.net/files/ から読める
const NATIVE = typeof window !== "undefined" && !!window.NativeApp;
const nativeUrl = name => `https://appassets.androidplatform.net/files/${encodeURIComponent(name)}`;

async function dir(name) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(name, { create: true });
}

export async function writeFile(folder, name, blob) {
  const d = await dir(folder);
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readFile(folder, name) {
  if (NATIVE) {
    const r = await fetch(nativeUrl(name));
    if (!r.ok) throw new Error("not found");
    return r.blob();
  }
  const d = await dir(folder);
  const fh = await d.getFileHandle(name);
  return fh.getFile();
}

export async function removeFile(folder, name) {
  if (NATIVE) { window.NativeApp.deleteFile(name); return; }
  try { const d = await dir(folder); await d.removeEntry(name); } catch (e) { /* 無ければ何もしない */ }
}

export async function persist() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : false;
  } catch (e) { return false; }
}

export async function usage() {
  try { return await navigator.storage.estimate(); } catch (e) { return null; }
}
