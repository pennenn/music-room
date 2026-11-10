// Firebase 同期：曲の情報（タイトル等）・高評価・ムード・プレイリスト・再生履歴だけを同期する
// 音声ファイルは同期しない（各端末に保存）。保存先は music/{uid}/{tracks|playlists|plays}
import * as db from "./db.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const COLLS = ["tracks", "playlists", "plays"];

export function configured() {
  const c = self.FIREBASE_CONFIG;
  return !!(c && c.apiKey && !String(c.apiKey).startsWith("YOUR_"));
}

export class Cloud extends EventTarget {
  constructor(device) {
    super();
    this.device = device;
    this.user = null; this.ready = false; this.syncing = false; this.lastError = ""; this.timer = null;
  }

  emit(type) { this.dispatchEvent(new Event(type)); }

  async init() {
    if (!configured()) return false;
    try {
      const [{ initializeApp }, authMod, fsMod] = await Promise.all([
        import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]);
      this.A = authMod; this.F = fsMod;
      const app = initializeApp(self.FIREBASE_CONFIG, "music-room");
      this.auth = authMod.getAuth(app);
      this.fs = fsMod.getFirestore(app);
      authMod.getRedirectResult(this.auth).catch(() => {});
      authMod.onAuthStateChanged(this.auth, u => {
        this.user = u; this.emit("user");
        if (u) this.sync();
      });
      this.ready = true;
      // 画面に戻ったときと、開いている間は 3 分ごとに同期
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.sync(); });
      setInterval(() => { if (!document.hidden) this.sync(); }, 180000);
      return true;
    } catch (e) {
      this.lastError = "Firebase を読み込めませんでした（オフライン？）";
      return false;
    }
  }

  async signIn() {
    const p = new this.A.GoogleAuthProvider();
    try { await this.A.signInWithPopup(this.auth, p); }
    catch (e) {
      if (String(e.code).includes("popup")) await this.A.signInWithRedirect(this.auth, p);
      else throw e;
    }
  }
  signOut() { return this.A.signOut(this.auth); }

  // 変更のあと少し待ってから同期
  schedule() {
    if (!this.user) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 4000);
  }

  col(name) { return this.F.collection(this.fs, "music", this.user.uid, name); }

  async sync() {
    if (!this.user || this.syncing || !navigator.onLine) return;
    this.syncing = true; this.emit("status");
    const F = this.F;
    try {
      // ---- 送信（この端末で変わったもの）
      const tracks = await db.all("tracks"), playlists = await db.all("playlists"), plays = await db.all("plays");
      const writes = [];
      for (const t of tracks.filter(x => x.dirty)) {
        writes.push(["tracks", t.key, { title: t.title, artist: t.artist, duration: t.duration || 0,
          liked: t.liked ? 1 : 0, mood: t.mood || null, video_id: t.video_id || null, updated: t.updated }, t]);
      }
      for (const p of playlists.filter(x => x.dirty)) {
        writes.push(["playlists", p.id, { name: p.name, items: p.items, updated: p.updated, deleted: p.deleted ? 1 : 0,
          created: p.created || p.updated }, p]);
      }
      for (const p of plays.filter(x => x.dirty)) {
        writes.push(["plays", p.id, { key: p.key, title: p.title, artist: p.artist, at: p.at, seconds: p.seconds,
          completed: p.completed, device: p.device, updated: p.updated }, p]);
      }
      for (let i = 0; i < writes.length; i += 400) {
        const batch = F.writeBatch(this.fs);
        for (const [c, id, data] of writes.slice(i, i + 400)) batch.set(F.doc(this.col(c), id), data, { merge: true });
        await batch.commit();
      }
      for (const [c, , data, local] of writes) {   // 送信後に変わっていなければ「送信済み」にする
        const cur = await db.get(c, c === "tracks" ? local.key : local.id);
        if (cur && cur.updated === data.updated) { cur.dirty = 0; await db.put(c, cur); }
      }
      // ---- 受信（ほかの端末で変わったもの）
      let changed = false;
      for (const c of COLLS) {
        const since = await db.getMeta("pull_" + c, 0);
        const snap = await F.getDocs(F.query(this.col(c), F.where("updated", ">", since)));
        let max = since;
        for (const d of snap.docs) {
          const r = d.data();
          max = Math.max(max, r.updated || 0);
          if (c === "tracks") changed = (await this._mergeTrack(d.id, r)) || changed;
          else if (c === "playlists") {
            const local = await db.get("playlists", d.id);
            if (!local || (r.updated > local.updated && !local.dirty)) {
              await db.put("playlists", { id: d.id, ...r, dirty: 0 }); changed = true;
            }
          } else if (r.device !== this.device) {
            await db.put("plays", { id: d.id, ...r, dirty: 0 }); changed = true;
          }
        }
        // 端末の時計のずれを考えて 5 分戻した位置から次回を始める（重複しても上書きなので問題なし）
        await db.setMeta("pull_" + c, Math.max(0, max - 300000));
      }
      this.lastSync = Date.now(); this.lastError = "";
      await db.setMeta("lastSync", this.lastSync);
      if (changed) this.emit("changed");
    } catch (e) {
      this.lastError = e.code === "permission-denied" ? "権限がありません（Firestore のルールを確認）" : (e.message || String(e));
    }
    this.syncing = false; this.emit("status");
  }

  async _mergeTrack(key, r) {
    const local = await db.get("tracks", key);
    if (!local) {   // この端末に無い曲は情報だけ持っておく（プレイリストで「未保存」と表示）
      await db.put("tracks", { key, title: r.title, artist: r.artist, duration: r.duration || 0, liked: r.liked || 0,
        mood: r.mood || null, video_id: r.video_id || null, updated: r.updated, dirty: 0, file: null, art: null,
        added: 0, analyzed: 0 });
      return true;
    }
    if (r.updated > (local.updated || 0) && !local.dirty) {
      Object.assign(local, { liked: r.liked || 0, mood: r.mood || null, updated: r.updated });
      if (!local.file) Object.assign(local, { title: r.title, artist: r.artist });
      await db.put("tracks", local);
      return true;
    }
    return false;
  }
}
