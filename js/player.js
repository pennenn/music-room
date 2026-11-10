// プレイヤー：バックグラウンド再生・ロック画面操作（Media Session）・再生履歴の記録
import * as db from "./db.js";
import { PLAY_MIN_SECONDS, shuffle as shuffleArr } from "./logic.js";

export class Player extends EventTarget {
  constructor(device) {
    super();
    this.device = device;
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.queue = []; this.index = -1; this.current = null;
    this.shuffle = false; this.repeat = 0;   // 0=なし 1=全曲 2=1曲
    this.radio = null;                       // キューの最後で曲を補充する関数
    this.url = null; this.artUrl = null;
    this.play_ = null; this.lastPos = null; this.saveTimer = null;

    const a = this.audio;
    a.addEventListener("timeupdate", () => this._tick());
    a.addEventListener("ended", () => this.next(true));
    a.addEventListener("play", () => this._state());
    a.addEventListener("pause", () => { this._state(); this._savePlay(); });
    a.addEventListener("error", () => {
      if (this.current) { this.emit("error", this.current); setTimeout(() => this.next(true), 400); }
    });
    a.addEventListener("loadedmetadata", () => this._position());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this._savePlay(); });
    window.addEventListener("pagehide", () => this._savePlay());
    this._mediaSession();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  get playing() { return !this.audio.paused; }

  async playTracks(tracks, start = 0, opts = {}) {
    tracks = tracks.filter(t => t && t.file);
    if (!tracks.length) return;
    if (opts.shuffle !== undefined) this.shuffle = opts.shuffle;
    this.radio = opts.radio || null;
    start = Math.min(start, tracks.length - 1);
    if (this.shuffle) {
      const first = tracks[start];
      tracks = [first, ...shuffleArr(tracks.filter((_, i) => i !== start))];
      start = 0;
    }
    this.queue = tracks;
    this.emit("mode");
    await this._load(start);
  }

  playNext(tracks) {
    if (!this.queue.length) return this.playTracks(tracks);
    this.queue.splice(this.index + 1, 0, ...tracks.filter(t => t.file));
  }

  async _load(i) {
    await this._savePlay(true);
    this.index = i;
    this.current = this.queue[i];
    const t = this.current;
    try {
      const file = await db.readFile("tracks", t.file);
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(file);
      this.audio.src = this.url;
    } catch (e) {
      this.emit("error", t);
      return setTimeout(() => this.next(true), 400);
    }
    if (this.artUrl) { URL.revokeObjectURL(this.artUrl); this.artUrl = null; }
    if (t.art) {
      try { this.artUrl = URL.createObjectURL(await db.readFile("art", t.art)); } catch (e) { /* なし */ }
    }
    this.play_ = { id: `${this.device}-${Date.now()}`, key: t.key, title: t.title, artist: t.artist,
      at: Date.now(), seconds: 0, device: this.device };
    this.lastPos = 0;
    this._metadata();
    this.emit("track", t);
    try { await this.audio.play(); } catch (e) { this._state(); }
  }

  _tick() {
    const pos = this.audio.currentTime;
    if (this.play_ && this.playing && this.lastPos != null) {
      const d = pos - this.lastPos;
      if (d > 0 && d < 2) this.play_.seconds += d;   // シークは除外
    }
    this.lastPos = pos;
    this.emit("time", { pos, dur: this.audio.duration || this.current?.duration || 0 });
    if (!this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = null; this._savePlay(); }, 10000);
    if (Math.floor(pos) % 5 === 0) this._position();
  }

  // 再生記録は途中でも保存（アプリが閉じられても失われないように）
  async _savePlay(finish = false) {
    const p = this.play_;
    if (!p || p.seconds < 1) { if (finish) this.play_ = null; return; }
    const dur = this.audio.duration || this.current?.duration || 0;
    const rec = { ...p, seconds: Math.round(p.seconds * 10) / 10,
      completed: p.seconds >= PLAY_MIN_SECONDS || (dur > 0 && p.seconds >= dur * 0.5) ? 1 : 0,
      updated: Date.now(), dirty: 1 };
    await db.put("plays", rec);
    if (finish) this.play_ = null;
    this.emit("played", rec);
  }

  toggle() {
    if (!this.current) return this.emit("empty");
    this.playing ? this.audio.pause() : this.audio.play();
  }

  async next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 2) return this._load(this.index);
    if (this.index + 1 < this.queue.length) return this._load(this.index + 1);
    if (this.radio) {
      const more = (await this.radio()).filter(t => t.file);
      if (more.length) { this.queue.push(...more); return this._load(this.index + 1); }
    }
    if (this.repeat === 1) return this._load(0);
    if (auto) { await this._savePlay(true); this.audio.pause(); this.audio.currentTime = 0; this._state(); }
  }

  prev() {
    if (this.audio.currentTime > 3 || this.index <= 0) { this.seek(0); return; }
    this._load(this.index - 1);
  }

  seek(sec) { this.audio.currentTime = Math.max(0, sec); this.lastPos = this.audio.currentTime; this._position(); }

  setShuffle(on) {
    this.shuffle = on;
    if (on && this.queue.length) this.queue = [...this.queue.slice(0, this.index + 1), ...shuffleArr(this.queue.slice(this.index + 1))];
    this.emit("mode");
  }
  cycleRepeat() { this.repeat = (this.repeat + 1) % 3; this.emit("mode"); }

  // ---------- ロック画面・通知の操作
  _mediaSession() {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* 未対応 */ } };
    set("play", () => this.audio.play());
    set("pause", () => this.audio.pause());
    set("previoustrack", () => this.prev());
    set("nexttrack", () => this.next());
    set("seekbackward", d => this.seek(this.audio.currentTime - (d.seekOffset || 10)));
    set("seekforward", d => this.seek(this.audio.currentTime + (d.seekOffset || 10)));
    set("seekto", d => this.seek(d.seekTime));
    set("stop", () => this.audio.pause());
  }

  _metadata() {
    if (!("mediaSession" in navigator) || !this.current) return;
    const t = this.current;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: "ミュージックルーム",
      artwork: this.artUrl ? [{ src: this.artUrl, sizes: "512x512", type: "image/jpeg" }]
        : [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
  }

  _position() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const d = this.audio.duration;
    if (!d || !isFinite(d)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: d, playbackRate: this.audio.playbackRate,
        position: Math.min(this.audio.currentTime, d) });
    } catch (e) { /* 無視 */ }
  }

  _state() {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = this.playing ? "playing" : "paused";
    this.emit("state", this.playing);
  }
}
