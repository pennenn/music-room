// Android アプリ版のときだけ使う：ダウンロード・再生・ファイル操作を Android 側（NativeApp）に任せる
import * as db from "./db.js";

export const N = window.NativeApp || null;
export const isNative = !!N;
export const fileUrl = name => `https://appassets.androidplatform.net/files/${encodeURIComponent(name)}`;

const listeners = {};
window.nativeEvent = (type, json) => {
  let data = null;
  try { data = json ? JSON.parse(json) : null; } catch (e) { /* 無視 */ }
  for (const f of listeners[type] || []) f(data);
};
export function on(type, f) { (listeners[type] ||= []).push(f); }

export function info() { try { return JSON.parse(N.info()); } catch (e) { return null; } }

// ---------- 再生（Android の再生サービスを操作）
const item = t => ({ key: t.key, file: t.file, title: t.title, artist: t.artist, art: t.art || "", duration: t.duration || 0 });

export class NativePlayer extends EventTarget {
  constructor(device) {
    super();
    this.device = device;
    this.queue = []; this.index = -1; this.current = null;
    this.shuffle = false; this.repeat = 0; this.radio = null;
    this._playing = false;
    this.audio = { duration: 0 };   // 画面側との互換用
    on("transition", d => { this.index = d.index; this.current = this.queue[d.index] || null; this.emit("track", this.current); });
    on("state", d => {
      if (d.index >= 0 && this.queue[d.index] && this.current !== this.queue[d.index]) {
        this.index = d.index; this.current = this.queue[d.index]; this.emit("track", this.current);
      }
      this._playing = !!d.playing; this.emit("state", this._playing);
    });
    on("time", d => { this.audio.duration = d.dur; this.emit("time", d); });
    on("ended", async () => {
      if (!this.radio) return;
      const more = (await this.radio()).filter(t => t.file);
      if (more.length) { this.queue.push(...more); N.appendAndPlay(JSON.stringify(more.map(item))); }
    });
    on("perror", () => { if (this.current) this.emit("error", this.current); });
    on("plays", () => this.collect());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.collect(); });
    this.collect();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  get playing() { return this._playing; }

  // 再生サービスが記録した再生履歴を受け取って保存
  async collect() {
    let list = [];
    try { list = JSON.parse(N.takePlays()); } catch (e) { return; }
    for (const p of list) {
      const rec = { id: `${this.device}-${p.at}`, key: p.key, title: p.title, artist: p.artist, at: p.at,
        seconds: p.seconds, completed: p.completed, device: this.device, updated: Date.now(), dirty: 1 };
      await db.put("plays", rec);
      this.emit("played", rec);
    }
  }

  async playTracks(tracks, start = 0, opts = {}) {
    tracks = tracks.filter(t => t && t.file);
    if (!tracks.length) return;
    if (opts.shuffle !== undefined) this.shuffle = opts.shuffle;
    this.radio = opts.radio || null;
    start = Math.min(start, tracks.length - 1);
    if (this.shuffle && opts.shuffle) start = Math.floor(Math.random() * tracks.length);
    this.queue = tracks;
    this.index = start; this.current = tracks[start];
    N.setQueue(JSON.stringify(tracks.map(item)), start, this.shuffle);
    this.emit("mode");
    this.emit("track", this.current);
  }

  playNext(tracks) {
    const list = tracks.filter(t => t.file);
    if (!this.queue.length) return this.playTracks(list);
    this.queue.splice(this.index + 1, 0, ...list);
    N.insertNext(JSON.stringify(list.map(item)));
  }

  toggle() { if (!this.current) return this.emit("empty"); N.toggle(); }
  next() { N.next(); }
  prev() { N.prev(); }
  seek(sec) { N.seek(Math.max(0, Math.round(sec * 1000))); }
  setShuffle(on) { this.shuffle = on; N.setShuffle(on); this.emit("mode"); }
  cycleRepeat() { this.repeat = (this.repeat + 1) % 3; N.setRepeat(this.repeat); this.emit("mode"); }
}

// ---------- ダウンロード（Android アプリに内蔵した yt-dlp）
export class NativeDownloader extends EventTarget {
  constructor(registerTrack) {
    super();
    this.registerTrack = registerTrack;   // async (meta) => 取り込み
    this.jobs = [];
    on("job", d => {
      const j = this.jobs.find(x => x.id === d.id);
      if (!j) return;
      Object.assign(j, d);
      this.dispatchEvent(new Event("change"));
    });
    on("saved", async d => {
      const j = this.jobs.find(x => x.id === d.job);
      if (j) { j.title = d.title; j.saving = true; this.dispatchEvent(new Event("change")); }
      await this.registerTrack({ file: d.file, art: d.art || null, ext: d.ext, size: d.size, title: d.title,
        artist: d.artist, duration: d.duration, videoId: d.video_id, tags: d.tags });
      if (j) { j.saving = false; this.dispatchEvent(new Event("change")); }
    });
  }

  async ping() { const i = info(); return i && i.ready ? { ytdlp: i.ytdlp, ffmpeg: true, native: true } : (i?.error ? null : { ytdlp: "準備中", ffmpeg: true, native: true }); }

  async start(url, opts) {
    const id = N.download(url, opts.mode, Number(opts.bitrate) || 192, !!opts.noplaylist);
    const job = { id, url, status: "queued", progress: 0, title: "", error: "", count: 0, index: 0, saved: 0 };
    this.jobs.unshift(job);
    this.dispatchEvent(new Event("change"));
    return job;
  }

  cancel(job) { N.cancel(job.id); }

  update() {
    return new Promise(resolve => {
      on("updated", d => resolve(d));
      N.updateYtdlp();
    });
  }
}
