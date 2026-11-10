// ミュージックルーム（携帯版）  ※私的利用専用
import * as db from "./db.js";
import * as L from "./logic.js";
import { Player } from "./player.js";
import { Downloader, DEFAULT_SERVER } from "./termux.js";
import { Cloud, configured } from "./cloud.js";
import * as Native from "./native.js";

// ============================================================ 共通
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICONS = {
  library: '<path d="M5 4v16M9.5 4v16M14 5l4.5 14.5"/>',
  sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16v4M16.5 18h4"/>',
  chart: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  prev: '<path d="M6 5v14M18 6l-9 6 9 6z"/>', next: '<path d="M18 5v14M6 6l9 6-9 6z"/>',
  shuffle: '<path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M4 17h3.5c1.6 0 2.6-1.3 3.4-3M13.1 10c.8-1.7 1.8-3 3.4-3H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>',
  repeat: '<path d="M5 11V9a2 2 0 0 1 2-2h12M16 4l3 3-3 3M19 13v2a2 2 0 0 1-2 2H5M8 20l-3-3 3-3"/>',
  repeat1: '<path d="M5 11V9a2 2 0 0 1 2-2h12M16 4l3 3-3 3M19 13v2a2 2 0 0 1-2 2H5M8 20l-3-3 3-3M12 10.5v4"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>', music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>', down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', downarrow: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>', paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 3h6v3H9z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20 16l-5-5-7 8"/>',
};
const icon = (n, cls = "", fill = false) =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const THEMES = { light: ["ライト", "#FFFFFF", "#0F1419"], dim: ["ダーク（Dim）", "#15202B", "#F7F9F9"], lightsout: ["ダーク（Lights Out）", "#000000", "#E7E9EA"] };

const S = {
  page: "library", libTab: "all", search: "", openPl: null, editPl: false, year: new Date().getFullYear(),
  tracks: [], playlists: [], plays: [], mixSeed: new Date().toISOString().slice(0, 10), mix: [],
  dl: { url: "", mode: "m4a", bitrate: "192", noplaylist: true }, server: null, settings: {},
};
let device, player, downloader, cloud;
const artCache = new Map();

// ============================================================ データ
async function loadAll() {
  S.tracks = await db.all("tracks");
  S.playlists = (await db.all("playlists")).filter(p => !p.deleted).sort((a, b) => (a.created || 0) - (b.created || 0));
  S.plays = await db.all("plays");
}
const localTracks = () => S.tracks.filter(t => t.file).sort((a, b) => (b.added || 0) - (a.added || 0));
const byKey = () => new Map(S.tracks.map(t => [t.key, t]));

async function saveTrack(t, synced = true) {
  if (synced) { t.updated = Date.now(); t.dirty = 1; }
  await db.put("tracks", t);
  const i = S.tracks.findIndex(x => x.key === t.key);
  if (i >= 0) S.tracks[i] = t; else S.tracks.push(t);
  if (synced) cloud?.schedule();
}

async function savePlaylist(p) {
  p.updated = Date.now(); p.dirty = 1;
  await db.put("playlists", p);
  await loadAll();
  cloud?.schedule();
}

async function setting(k, v) {
  S.settings[k] = v;
  await db.setMeta("settings", S.settings);
}

// 取り込み（ダウンロード・端末のファイル共通）
async function addTrack({ blob, ext, title, artist, duration, videoId, tags, thumb }) {
  const key = await L.trackKey(videoId, title, artist);
  const name = `${key}.${ext}`;
  await db.writeFile("tracks", name, blob);
  let art = null;
  if (thumb) { art = `${key}.jpg`; await db.writeFile("art", art, thumb); artCache.delete(key); }
  const old = S.tracks.find(t => t.key === key);
  const t = Object.assign(old || { liked: 0, mood: null, analyzed: 0 }, {
    key, title, artist: artist || "不明なアーティスト", duration: duration || 0, file: name, art: art || old?.art || null,
    ext, size: blob.size, tags: tags || "", video_id: videoId || null, added: Date.now(),
  });
  if (!old || !old.file) t.analyzed = 0;
  await saveTrack(t, true);
  db.persist();
  queueAnalysis();
  return t;
}

// Android アプリ版：ファイルは Android 側で保存済み。情報だけ登録する
async function registerNative({ file, art, ext, size, title, artist, duration, videoId, tags }) {
  const key = await L.trackKey(videoId, title, artist);
  const old = S.tracks.find(t => t.key === key);
  if (old?.file && old.file !== file) await db.removeFile("tracks", old.file);   // 同じ曲を入れ直したら古い方を消す
  if (old?.art && art && old.art !== art) await db.removeFile("art", old.art);
  artCache.delete(key);
  const t = Object.assign(old || { liked: 0, mood: null, analyzed: 0 }, {
    key, title, artist: artist || "不明なアーティスト", duration: duration || 0, file, art: art || old?.art || null,
    ext, size, tags: tags || "", video_id: videoId || null, added: Date.now(),
  });
  if (!old || !old.file) t.analyzed = 0;
  await saveTrack(t, true);
  queueAnalysis();
  if (S.page === "library") render();
  return t;
}

async function importNative(items) {
  for (const it of items) {
    const g = L.guessFromFilename(it.name || it.file);
    await registerNative({ file: it.file, ext: it.ext, size: it.size, title: it.title || g.title,
      artist: it.artist || g.artist, duration: it.duration });
  }
  toast(`${items.length} 曲を取り込みました`);
  render();
}

async function importFiles(files) {
  let n = 0;
  for (const f of files) {
    const ext = (f.name.split(".").pop() || "m4a").toLowerCase();
    const g = L.guessFromFilename(f.name);
    const duration = await new Promise(res => {
      const a = new Audio(); const u = URL.createObjectURL(f);
      a.preload = "metadata"; a.src = u;
      a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(u); };
      a.onerror = () => { res(0); URL.revokeObjectURL(u); };
    });
    await addTrack({ blob: f, ext, title: g.title, artist: g.artist, duration });
    n++;
    toast(`取り込み中… ${n}/${files.length}`);
  }
  toast(`${n} 曲を取り込みました`);
  render();
}

// 音の解析（バックグラウンドで 1 曲ずつ）
let analyzing = false;
async function queueAnalysis() {
  if (analyzing) return;
  analyzing = true;
  try {
    for (;;) {
      const t = S.tracks.find(x => x.file && !x.analyzed);
      if (!t) break;
      let res = null;
      try { res = await L.analyzeBlob(await db.readFile("tracks", t.file), t.duration); } catch (e) { res = null; }
      Object.assign(t, res ? { ...res, analyzed: 1 } : { analyzed: 2 });
      await saveTrack(t, false);
      await new Promise(r => setTimeout(r, 300));
    }
  } finally { analyzing = false; }
  if (S.page === "mix") render();
}

// ============================================================ 画面の枠
function setTheme(name) {
  document.documentElement.dataset.theme = name;
  $('meta[name="theme-color"]').content = THEMES[name][1];
  if (Native.isNative) Native.N.setBarColor(THEMES[name][1], name !== "light");   // ステータスバーの色も合わせる
}

function toast(msg, ms = 3000) {
  const el = $("#toast");
  el.textContent = msg; el.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.style.display = "none"), ms);
}

function sheet(title, items) {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="sheet"><div class="grab"></div>${title ? `<div class="title">${esc(title)}</div>` : ""}
      ${items.map((it, i) => `<button class="item" data-i="${i}">${it.icon ? icon(it.icon) : ""}<span>${esc(it.label)}</span></button>`).join("")}</div>`;
    ov.addEventListener("click", e => {
      const b = e.target.closest(".item");
      if (b || e.target === ov) { ov.remove(); resolve(b ? items[+b.dataset.i] : null); }
    });
    document.body.appendChild(ov);
  });
}

function prompt_(title, value = "") {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="dialog"><div class="h2">${esc(title)}</div><input class="field" value="${esc(value)}">
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-r="0">キャンセル</button><button class="btn primary" data-r="1">OK</button></div></div>`;
    const inp = $("input", ov);
    const done = ok => { ov.remove(); resolve(ok ? inp.value.trim() : null); };
    ov.addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1"); else if (e.target === ov) done(false); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") done(true); });
    document.body.appendChild(ov);
    setTimeout(() => inp.focus(), 50);
  });
}

function confirm_(msg, ok = "OK") {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="dialog"><div style="white-space:pre-wrap">${esc(msg)}</div>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-r="0">キャンセル</button><button class="btn primary" data-r="1">${esc(ok)}</button></div></div>`;
    ov.addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b || e.target === ov) { ov.remove(); resolve(b?.dataset.r === "1"); } });
    document.body.appendChild(ov);
  });
}

const artHtml = (t, cls = "art") => `<div class="${cls}" data-art="${esc(t?.art ? t.key : "")}">${icon("music")}</div>`;

async function hydrateArt(root = document) {
  for (const el of root.querySelectorAll("[data-art]")) {
    const key = el.dataset.art;
    if (!key || el.dataset.done) continue;
    el.dataset.done = 1;
    let url = artCache.get(key);
    if (!url) {
      const t = S.tracks.find(x => x.key === key);
      if (!t?.art) continue;
      try { url = URL.createObjectURL(await db.readFile("art", t.art)); artCache.set(key, url); } catch (e) { continue; }
    }
    el.innerHTML = `<img src="${url}" alt="">`;
  }
}

const NAV = [["library", "ライブラリ", "library"], ...(Native.isNative ? [["browser", "ブラウザ", "browser"]] : []),
  ["mix", "おすすめ", "sparkle"], ["review", "振り返り", "chart"], ["settings", "設定", "settings"]];
const openBrowser = url => Native.openBrowser(url, S.dl);

function renderNav() {
  $("#nav").innerHTML = NAV.map(([id, label, ic]) =>
    `<button data-act="nav" data-id="${id}" class="${S.page === id ? "on" : ""}">${icon(ic)}<span>${label}</span></button>`).join("");
  $("#fab").innerHTML = icon(S.page === "download" && jobsRunning() ? "list" : "download", "l");
  $("#fab").classList.toggle("raised", $("#mini").classList.contains("show"));
}

function render() {
  const pages = { library: pageLibrary, mix: pageMix, review: pageReview, settings: pageSettings, download: pageDownload };
  const [head, body] = pages[S.page]();
  $("#top").innerHTML = head;
  $("#page").innerHTML = body;
  renderNav();
  hydrateArt();
  bindInputs();
}

// ============================================================ ライブラリ
function trackRow(t, i, opts = {}) {
  const now = player.current?.key === t.key;
  const missing = !t.file;
  return `<div class="track ${now ? "now" : ""} ${missing ? "missing" : ""}" data-act="${missing ? "" : "play-row"}" data-i="${i}">
    ${artHtml(t)}
    <div class="grow"><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}${missing ? "　·　この端末に未保存" : ""}</div></div>
    ${opts.edit ? `<button class="icon-btn dim" data-act="pl-move" data-i="${i}" data-d="-1">${icon("up", "s")}</button>
      <button class="icon-btn dim" data-act="pl-move" data-i="${i}" data-d="1">${icon("downarrow", "s")}</button>
      <button class="icon-btn dim" data-act="pl-remove" data-i="${i}">${icon("close", "s")}</button>`
    : `${missing ? "" : `<button class="icon-btn ${t.liked ? "" : "dim"}" data-act="like" data-key="${esc(t.key)}">${icon("heart", "s", !!t.liked)}</button>`}
      <button class="icon-btn dim" data-act="track-menu" data-key="${esc(t.key)}">${icon("more", "s")}</button>`}
  </div>`;
}

let listCache = [];
function pageLibrary() {
  if (S.openPl) return pagePlaylist();
  const head = `<h1>ライブラリ</h1><button class="icon-btn" data-act="import">${icon("file")}</button>`;
  const tabs = `<div class="chips">${[["all", "すべての曲"], ["liked", "高評価"], ["playlists", "プレイリスト"]].map(([id, l]) =>
    `<button class="chip ${S.libTab === id ? "on" : ""}" data-act="lib-tab" data-id="${id}">${l}</button>`).join("")}</div>`;
  let body = `<input class="field search" id="search" placeholder="曲名・アーティストで検索" value="${esc(S.search)}" style="margin-bottom:10px">${tabs}`;
  if (S.libTab === "playlists") {
    body += `<button class="btn" data-act="pl-new">${icon("plus", "s")}新しいプレイリスト</button><div class="list" style="margin-top:10px">`;
    const km = byKey();
    body += S.playlists.map(p => {
      const have = p.items.filter(k => km.get(k)?.file).length;
      return `<div class="track" data-act="pl-open" data-id="${esc(p.id)}"><div class="art">${icon("list")}</div>
        <div class="grow"><div class="t-title">${esc(p.name)}</div><div class="t-sub">${p.items.length} 曲${have < p.items.length ? `（この端末に ${have} 曲）` : ""}</div></div></div>`;
    }).join("") || `<div class="empty">プレイリストはまだありません</div>`;
    return [head, body + "</div>"];
  }
  let list = localTracks();
  if (S.libTab === "liked") list = list.filter(t => t.liked);
  const q = S.search.toLowerCase();
  if (q) list = list.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  listCache = list;
  const total = list.reduce((a, t) => a + (t.duration || 0), 0);
  body += `<div class="row" style="margin-bottom:6px"><div class="grow muted">${list.length} 曲 · ${L.fmtHours(total)}</div>
    <button class="btn sm" data-act="play-list" data-shuffle="1">${icon("shuffle", "s")}シャッフル</button>
    <button class="btn sm primary" data-act="play-list">${icon("play", "s", true)}再生</button></div>`;
  body += list.length ? `<div class="list">${list.map((t, i) => trackRow(t, i)).join("")}</div>`
    : `<div class="empty">${S.libTab === "liked" ? "ハートを付けた曲がここに並びます。" :
      "曲がありません。<br>右下のボタンからダウンロードするか、右上のボタンで端末の音楽ファイルを取り込んでください。"}</div>`;
  return [head, body];
}

function pagePlaylist() {
  const p = S.playlists.find(x => x.id === S.openPl);
  if (!p) { S.openPl = null; return pageLibrary(); }
  const km = byKey();
  listCache = p.items.map(k => km.get(k) || { key: k, title: "（情報なし）", artist: "", file: null });
  const head = `<button class="icon-btn" data-act="pl-close">${icon("back")}</button><h1>${esc(p.name)}</h1>
    <button class="icon-btn" data-act="pl-menu">${icon("more")}</button>`;
  const have = listCache.filter(t => t.file).length;
  let body = `<div class="row" style="margin-bottom:6px"><div class="grow muted">${p.items.length} 曲${have < p.items.length ? ` · この端末に ${have} 曲` : ""}</div>
    ${S.editPl ? `<button class="btn sm primary" data-act="pl-edit">完了</button>` :
    `<button class="btn sm" data-act="play-list" data-shuffle="1">${icon("shuffle", "s")}シャッフル</button>
     <button class="btn sm primary" data-act="play-list">${icon("play", "s", true)}再生</button>`}</div>`;
  body += listCache.length ? `<div class="list">${listCache.map((t, i) => trackRow(t, i, { edit: S.editPl })).join("")}</div>`
    : `<div class="empty">曲の ⋯ から「プレイリストに追加」で追加できます。</div>`;
  return [head, body];
}

async function trackMenu(key) {
  const t = S.tracks.find(x => x.key === key);
  if (!t) return;
  const items = [{ label: "次に再生", icon: "play", id: "next" }, { label: "プレイリストに追加", icon: "plus", id: "pl" },
    { label: t.liked ? "高評価を解除" : "高評価", icon: "heart", id: "like" }, { label: "ムードを設定", icon: "sparkle", id: "mood" },
    { label: "曲情報を編集", icon: "edit", id: "edit" }, { label: "アートワークを変更", icon: "image", id: "art" },
    ...(Native.isNative && t.video_id ? [{ label: "YouTube から情報を取り直す", icon: "reload", id: "refresh" }] : []),
    { label: "この端末から削除", icon: "trash", id: "del" }];
  const c = await sheet(t.title, items);
  if (!c) return;
  if (c.id === "next") { player.playNext([t]); toast("次に再生します"); }
  if (c.id === "edit") await editInfo(t);
  if (c.id === "art") pickArt(t);
  if (c.id === "refresh") {
    toast("情報を取得しています…", 15000);
    toast(await refreshTrack(t) ? "曲情報を更新しました" : "取得できませんでした");
    render(); renderMini();
  }
  if (c.id === "like") { t.liked = t.liked ? 0 : 1; await saveTrack(t); render(); }
  if (c.id === "pl") await addToPlaylist([t.key]);
  if (c.id === "mood") {
    const m = await sheet("ムード", [{ label: "自動判定", id: null }, ...Object.entries(L.MOODS).map(([id, m]) => ({ label: m.label, id }))]);
    if (m) { t.mood = m.id; await saveTrack(t); render(); }
  }
  if (c.id === "del" && await confirm_(`「${t.title}」をこの端末から削除しますか？\n（高評価やプレイリストの情報は残ります）`, "削除")) {
    await db.removeFile("tracks", t.file);
    if (t.art) await db.removeFile("art", t.art);
    t.file = null; t.art = null; artCache.delete(t.key);
    await saveTrack(t, false);
    render();
  }
}

// ---- 曲情報の更新
function form_(title, fields) {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="dialog"><div class="h2">${esc(title)}</div>
      ${fields.map((f, i) => `<div class="muted" style="margin:10px 0 4px">${esc(f.label)}</div><input class="field" data-i="${i}" value="${esc(f.value)}">`).join("")}
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-r="0">キャンセル</button><button class="btn primary" data-r="1">保存</button></div></div>`;
    const done = ok => { const v = [...ov.querySelectorAll("input")].map(x => x.value.trim()); ov.remove(); resolve(ok ? v : null); };
    ov.addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1"); else if (e.target === ov) done(false); });
    document.body.appendChild(ov);
  });
}

async function editInfo(t) {
  const v = await form_("曲情報を編集", [{ label: "タイトル", value: t.title }, { label: "アーティスト", value: t.artist }]);
  if (!v || !v[0]) return;
  t.title = v[0]; t.artist = v[1] || "不明なアーティスト";
  await saveTrack(t);
  if (player.current?.key === t.key) Object.assign(player.current, { title: t.title, artist: t.artist });
  toast("曲情報を保存しました");
  render(); renderMini();
}

async function setArt(t, name) {
  const old = t.art;
  t.art = name;
  artCache.delete(t.key);
  await saveTrack(t, false);
  if (old && old !== name) await db.removeFile("art", old);
  if (player.current?.key === t.key) player.current.art = name;
  render(); renderMini();
}

let artTarget = null;
function pickArt(t) {
  artTarget = t;
  if (Native.isNative) Native.N.pickArt(t.key);
  else $("#artpick").click();
}

// YouTube から取り直す（アプリ版のみ）。成功したら true
async function refreshTrack(t) {
  const r = await downloader.refreshInfo(t.video_id, t.key);
  if (!r.ok) return false;
  Object.assign(t, { title: r.title || t.title, artist: r.artist || t.artist, duration: r.duration || t.duration, tags: r.tags || t.tags });
  await saveTrack(t);
  if (r.art) await setArt(t, r.art);
  return true;
}

let bulk = null;
async function refreshAll() {
  if (bulk) return;
  const list = localTracks().filter(t => t.video_id);
  if (!list.length) return toast("YouTube からダウンロードした曲がありません");
  bulk = { done: 0, total: list.length, ok: 0 };
  render();
  for (const t of list) {
    if (await refreshTrack(t)) bulk.ok++;
    bulk.done++;
    if (S.page === "settings") render();
  }
  toast(`${bulk.ok} / ${bulk.total} 曲の情報を更新しました`);
  bulk = null;
  render();
}

async function addToPlaylist(keys) {
  const c = await sheet("プレイリストに追加", [{ label: "新しいプレイリスト…", icon: "plus", id: "new" },
    ...S.playlists.map(p => ({ label: p.name, icon: "list", id: p.id }))]);
  if (!c) return;
  let p;
  if (c.id === "new") {
    const name = await prompt_("新しいプレイリスト");
    if (!name) return;
    p = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 20), name, items: [], created: Date.now(), deleted: 0 };
  } else p = S.playlists.find(x => x.id === c.id);
  const add = keys.filter(k => !p.items.includes(k));
  p.items = [...p.items, ...add];
  await savePlaylist(p);
  toast(`「${p.name}」に ${add.length} 曲追加しました`);
}

// ============================================================ おすすめ
function pageMix() {
  const tracks = localTracks();
  S.mix = L.personalMix(tracks, S.plays, 30, S.mixSeed);
  const head = `<h1>おすすめ</h1>`;
  let body = `<div class="card"><div class="h2">あなたへのミックス</div>
    <div class="muted" style="margin-bottom:10px">再生履歴・高評価・最近ダウンロードした曲から自動で選びます（計算はこの端末の中だけ）。</div>`;
  body += S.mix.length ? `<div class="list">${S.mix.slice(0, 6).map((t, i) => `<div class="track" data-act="mix-play" data-i="${i}">${artHtml(t)}
      <div class="grow"><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}</div></div></div>`).join("")}</div>
      ${S.mix.length > 6 ? `<div class="muted" style="margin:4px 0 10px">ほか ${S.mix.length - 6} 曲</div>` : ""}`
    : `<div class="muted">曲がまだありません。</div>`;
  body += `<div class="row wrap" style="margin-top:8px"><button class="btn primary" data-act="mix-play" data-i="0">${icon("play", "s", true)}再生</button>
    <button class="btn" data-act="mix-redo">${icon("reload", "s")}作り直す</button>
    <button class="btn" data-act="mix-save">${icon("save", "s")}保存</button></div></div>`;
  body += `<div class="card"><div class="h2">ムード・シーン</div><div class="muted" style="margin-bottom:10px">テンポ・音の強さ・タイトルから自動で分類します。「ラジオ」は自動で選曲し続けます。</div>
    <div style="display:grid;gap:10px">`;
  for (const [id, m] of Object.entries(L.MOODS)) {
    const n = L.moodTracks(tracks, id).length;
    body += `<div class="card" style="margin:0"><div class="row"><div class="grow"><div style="font-weight:700">${m.label}</div>
      <div class="muted">${m.desc} · ${n ? `${n} 曲` : "まだありません"}</div></div></div>
      <div class="row wrap" style="margin-top:10px"><button class="btn sm primary" data-act="radio" data-id="${id}">${icon("radio", "s")}ラジオ</button>
      <button class="btn sm" data-act="mood-save" data-id="${id}">${icon("save", "s")}保存</button>
      <button class="btn sm" data-act="mood-yt" data-id="${id}">${icon("search", "s")}YouTube で探す</button></div></div>`;
  }
  const done = tracks.filter(t => t.analyzed).length;
  body += `</div></div><div class="card"><div class="h2">曲の解析</div><div class="muted">解析済み ${done} / ${tracks.length} 曲${analyzing ? "（解析中…）" : ""}</div>
    <div class="prog"><div style="width:${tracks.length ? done / tracks.length * 100 : 0}%"></div></div></div>`;
  return [head, body];
}

// ============================================================ 振り返り
function barChart(values, labels, tick = 1) {
  const W = 340, H = 150, top = 18, bottom = 20, ph = H - top - bottom, n = values.length, slot = W / n;
  const bw = Math.max(3, Math.min(slot - 2, slot * 0.62)), max = Math.max(...values) || 1, peak = values.indexOf(Math.max(...values));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  values.forEach((v, i) => {
    const h = ph * v / max, x = i * slot + (slot - bw) / 2, y = top + ph - h, r = Math.min(4, bw / 2, h);
    if (h > 0.5) s += `<path d="M${x},${top + ph}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${top + ph}Z"
      fill="${i === peak && v > 0 ? "var(--text)" : "var(--text2)"}"/>`;
    s += `<rect x="${i * slot}" y="${top}" width="${slot}" height="${ph}" fill="transparent" data-act="bar" data-tip="${esc(labels[i] + "  " + L.fmtHours(v))}"/>`;
    if (i % tick === 0) s += `<text x="${i * slot + slot / 2}" y="${H - 5}" font-size="10" text-anchor="middle" fill="var(--text2)">${esc(labels[i])}</text>`;
  });
  s += `<line x1="0" x2="${W}" y1="${top + ph + .5}" y2="${top + ph + .5}" stroke="var(--border2)"/>`;
  if (values[peak] > 0) {
    const h = ph * values[peak] / max;
    s += `<text x="${peak * slot + slot / 2}" y="${top + ph - h - 5}" font-size="10" text-anchor="middle" fill="var(--text)">${esc(L.fmtHours(values[peak]))}</text>`;
  }
  return s + "</svg>";
}

function hbars(rows) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([name, v], i) => `<div class="hbar"><div class="t-title">${esc(name)}</div>
    <div><div class="b ${i === 0 ? "top" : ""}" style="width:${Math.max(3, v / max * 100)}%"></div></div><div class="muted">${L.fmtHours(v)}</div></div>`).join("");
}

function pageReview() {
  const years = L.reviewYears(S.plays);
  if (!years.includes(S.year)) S.year = years[0];
  const head = `<h1>振り返り</h1><select class="field" id="year" style="width:auto">${years.map(y => `<option value="${y}" ${y === S.year ? "selected" : ""}>${y}年</option>`).join("")}</select>`;
  const r = L.yearReview(S.plays, byKey(), S.year);
  let body = `<div class="card"><div class="muted">${S.year}年のあなたの音楽${cloud?.user ? "（PC と携帯の合計）" : ""}</div>
    <div class="big-num">${L.fmtHours(r.seconds)}</div><div class="row" style="gap:28px">
    ${[[r.plays, "再生回数"], [r.tracks, "曲"], [r.artists, "アーティスト"]].map(([v, l]) => `<div><div class="stat">${v.toLocaleString()}</div><div class="muted">${l}</div></div>`).join("")}</div></div>`;
  if (!r.seconds) return [head, body + `<div class="card muted">まだ再生履歴がありません。曲を再生すると、聴いた時間・よく聴いた曲・トップアーティストがここに集計されます。</div>`];
  body += `<div class="card"><div class="h2">よく聴いた曲</div>${r.topTracks.map((t, i) => `<div class="track" style="cursor:default"><div class="rank">${i + 1}</div>
    ${artHtml(byKey().get(t.key) || t)}<div class="grow"><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}</div></div>
    <div class="muted">${t.plays} 回</div></div>`).join("")}</div>`;
  body += `<div class="card"><div class="h2">トップアーティスト</div>${hbars(r.topArtists)}</div>`;
  body += `<div class="card"><div class="h2">月ごとの再生時間</div>${barChart(r.months, Array.from({ length: 12 }, (_, i) => `${i + 1}月`))}</div>`;
  body += `<div class="card"><div class="h2">聴いた時間帯</div><div class="muted">いちばん聴いているのは ${r.peakHour}時台 です。</div>
    ${barChart(r.hours, Array.from({ length: 24 }, (_, i) => `${i}時`), 3)}</div>`;
  if (r.moods.length) body += `<div class="card"><div class="h2">ムード別</div>${hbars(r.moods)}</div>`;
  if (r.topDay) body += `<div class="card"><div class="h2">いちばん聴いた日</div><div class="stat">${r.topDay[0].replace(/-/g, "/")} · ${L.fmtHours(r.topDay[1])}</div></div>`;
  return [head, body];
}

// ============================================================ ダウンロード
const jobsRunning = () => downloader?.jobs.some(j => ["queued", "running"].includes(j.status));

function pageDownload() {
  const head = `<button class="icon-btn" data-act="nav" data-id="library">${icon("back")}</button><h1>ダウンロード</h1>
    <span class="row muted" style="font-size:12px"><span class="dot ${S.server ? "ok" : ""}"></span>${S.server ? "接続中" : "未接続"}</span>`;
  let body = "";
  if (Native.isNative && !S.server) {
    body += `<div class="card"><div class="h2">ダウンロード機能を準備しています</div>
      <div class="muted">初回は数十秒かかります。しばらくしてから「再接続」を押してください。</div>
      <button class="btn sm" data-act="ping" style="margin-top:10px">${icon("reload", "s")}再接続</button></div>`;
  } else if (!S.server) {
    body += `<div class="card"><div class="h2">ダウンロードサーバーが見つかりません</div>
      <div class="muted">Termux を開いて <code>ytdl</code> と入力し、サーバーを起動してください。初めての場合は「設定 → ダウンロードサーバー」の手順を見てください。</div>
      <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="ping">${icon("reload", "s")}再接続</button>
      <button class="btn sm" data-act="open-termux">Termux を開く</button></div></div>`;
  }
  if (Native.isNative) body += `<div class="card"><div class="h2">アプリ内ブラウザで探す</div>
    <div class="muted" style="margin-bottom:10px">YouTube を見ながら、右下のボタンで表示中の動画をそのままダウンロードできます。</div>
    <button class="btn primary" data-act="open-browser">${icon("browser", "s")}ブラウザを開く</button></div>`;
  body += `<div class="card"><div class="h2">URL</div><div class="muted" style="margin-bottom:8px">YouTube アプリの「共有」からこのアプリを選んでも追加できます。</div>
    <div class="row"><input class="field grow" id="dl-url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(S.dl.url)}">
    <button class="icon-btn" data-act="dl-paste">${icon("paste")}</button></div>
    <div class="chips" style="margin-top:10px">${[["m4a", "M4A（そのまま・高速）"], ["mp3", "MP3"]].map(([id, l]) =>
      `<button class="chip ${S.dl.mode === id ? "on" : ""}" data-act="dl-mode" data-id="${id}">${l}</button>`).join("")}</div>
    ${S.dl.mode === "mp3" ? `<div class="row"><span class="muted">ビットレート</span><select class="field" id="dl-br" style="width:auto">${["320", "256", "192", "128"].map(b =>
      `<option ${b === S.dl.bitrate ? "selected" : ""}>${b}</option>`).join("")}</select><span class="muted">kbps</span></div>` : ""}
    <label class="check"><input type="checkbox" id="dl-nopl" ${S.dl.noplaylist ? "checked" : ""}>動画 URL に list= が付いていても、その動画だけ</label>
    <button class="btn primary" data-act="dl-start" style="width:100%;justify-content:center;margin-top:6px" ${S.server ? "" : "disabled"}>${icon("download", "s")}ダウンロード</button></div>`;
  if (downloader.jobs.length) {
    body += `<div class="card"><div class="h2">進行状況</div>${downloader.jobs.map(j => {
      const st = { queued: "待機中", running: j.stage || "ダウンロード中", done: "完了", error: "エラー", cancelled: "中止" }[j.status] || j.status;
      const pos = j.count ? `${j.index}/${j.count} · ` : "";
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div class="row"><div class="grow t-title">${esc(j.title || j.url)}</div>
        ${["queued", "running"].includes(j.status) ? `<button class="icon-btn dim" data-act="dl-cancel" data-id="${j.id}">${icon("stop", "s")}</button>` : ""}</div>
        <div class="muted">${pos}${st}${j.saved ? ` · 保存 ${j.saved} 曲` : ""}${j.saving ? " · 端末に保存中…" : ""}${j.error ? ` · ${esc(j.error)}` : ""}</div>
        ${j.status === "running" ? `<div class="prog"><div style="width:${j.progress || 0}%"></div></div>` : ""}</div>`;
    }).join("")}</div>`;
  }
  body += `<div class="card"><div class="h2">端末のファイルを取り込む</div><div class="muted" style="margin-bottom:10px">携帯に保存済みの音楽ファイル（MP3・M4A など）をライブラリに追加します。</div>
    <button class="btn" data-act="import">${icon("file", "s")}ファイルを選ぶ</button></div>`;
  return [head, body];
}

async function startDownload() {
  const url = (S.dl.url || "").trim();
  const m = url.match(/https?:\/\/\S+/);
  if (!m) return toast("URL を入力してください");
  try {
    await downloader.start(m[0], { mode: S.dl.mode, bitrate: S.dl.bitrate, noplaylist: S.dl.noplaylist });
    S.dl.url = "";
    toast("ダウンロードを開始しました");
  } catch (e) { toast("開始できません: " + e.message); }
  render();
}

async function pingServer() {
  S.server = await downloader.ping();
  if (["download", "settings"].includes(S.page)) render();
  return S.server;
}

// ============================================================ 設定
let installEvt = null;
function pageSettings() {
  const head = `<h1>設定</h1>`;
  const theme = S.settings.theme || "lightsout";
  let body = `<div class="card"><div class="h2">テーマ</div><div class="tiles">${Object.entries(THEMES).map(([id, [l, bg, fg]]) =>
    `<button class="theme-tile ${theme === id ? "on" : ""}" data-act="theme" data-id="${id}" style="background:${bg};color:${fg}">${l}</button>`).join("")}</div></div>`;
  if (Native.isNative) return [head, body + settingsNative()];
  // 同期
  body += `<div class="card"><div class="h2">PC と同期</div>`;
  if (!configured()) body += `<div class="muted">firebase-config.js が未設定のため、同期は使えません。</div>`;
  else if (!cloud?.ready) body += `<div class="muted">${esc(cloud?.lastError || "読み込み中…")}</div>`;
  else if (!cloud.user) body += `<div class="muted" style="margin-bottom:10px">Google でログインすると、高評価・プレイリスト・再生履歴が PC と同期します。曲のファイルは同期しません。</div>
      <button class="btn primary" data-act="login">Google でログイン</button>`;
  else body += `<div class="muted">${esc(cloud.user.email || "")} でログイン中<br>${cloud.syncing ? "同期中…" : cloud.lastSync ? `最終同期 ${new Date(cloud.lastSync).toLocaleString("ja-JP")}` : ""}
      ${cloud.lastError ? `<br>エラー: ${esc(cloud.lastError)}` : ""}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="sync">${icon("reload", "s")}今すぐ同期</button><button class="btn sm" data-act="logout">ログアウト</button></div>`;
  body += `</div>`;
  // ダウンロードサーバー
  body += `<div class="card"><div class="h2">ダウンロードサーバー（Termux）</div>
    <div class="row muted" style="margin-bottom:8px"><span class="dot ${S.server ? "ok" : ""}"></span>${S.server ? `接続中 · yt-dlp ${esc(S.server.ytdlp)}${S.server.ffmpeg ? "" : " · ffmpeg なし（M4A のみ）"}` : "未接続"}</div>
    <div class="muted">はじめて使うとき（1 回だけ）:</div>
    <ol class="muted" style="padding-left:20px;margin:6px 0">
      <li>F-Droid から <b>Termux</b> をインストール（Google Play 版は古いので使わない）</li>
      <li>Termux を開いて、次の 1 行を貼り付けて実行<pre class="code">curl -sL ${esc(location.origin + location.pathname.replace(/[^/]*$/, ""))}termux/setup.sh | bash</pre></li>
      <li>以後は Termux で <code>ytdl</code> と入力すると起動します</li></ol>
    <div class="muted" style="margin:8px 0 4px">サーバーの URL</div>
    <div class="row"><input class="field grow" id="server-url" value="${esc(S.settings.server || DEFAULT_SERVER)}"><button class="btn sm" data-act="ping">確認</button></div>
    <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="ytdl-update" ${S.server ? "" : "disabled"}>yt-dlp を更新</button>
    <button class="btn sm" data-act="open-termux">Termux を開く</button></div></div>`;
  // 保存容量
  body += `<div class="card"><div class="h2">この端末の保存容量</div><div class="muted" id="usage">計算中…</div>
    <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="import">${icon("file", "s")}ファイルを取り込む</button>
    ${installEvt ? `<button class="btn sm primary" data-act="install">アプリをインストール</button>` : ""}</div></div>`;
  body += `<div class="card"><div class="h2">このアプリについて</div><div class="muted">私的利用の範囲でのみ使用してください。著作権者が許可していない曲の再配布・アップロードはしないでください。曲のファイルはこの端末の中だけに保存されます。</div></div>`;
  setTimeout(async () => {
    const u = await db.usage(), el = $("#usage");
    if (el && u) el.textContent = `使用 ${(u.usage / 1048576).toFixed(0)} MB / 空き ${((u.quota - u.usage) / 1073741824).toFixed(1)} GB · ${localTracks().length} 曲`;
  });
  return [head, body];
}

// Android アプリ版の設定（ダウンロード機能は内蔵、同期なし）
function settingsNative() {
  const i = Native.info() || {};
  const n = localTracks().length, size = localTracks().reduce((a, t) => a + (t.size || 0), 0);
  return `<div class="card"><div class="h2">ダウンロード機能</div>
    <div class="row muted" style="margin-bottom:8px"><span class="dot ${i.ready ? "ok" : ""}"></span>${i.ready ? `アプリに内蔵 · yt-dlp ${esc(i.ytdlp)}` : i.error ? `準備に失敗: ${esc(i.error)}` : "準備中…"}</div>
    <div class="muted" style="margin-bottom:10px">ダウンロードに失敗するようになったら、yt-dlp を更新してください（YouTube の仕様変更に追従します）。</div>
    <button class="btn sm" data-act="ytdl-update" ${i.ready ? "" : "disabled"}>${icon("reload", "s")}yt-dlp を更新</button></div>
    <div class="card"><div class="h2">この端末の曲</div><div class="muted">${n} 曲 · ${(size / 1048576).toFixed(0)} MB</div>
    <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="import">${icon("file", "s")}ファイルを取り込む</button></div></div>
    <div class="card"><div class="h2">曲情報をまとめて更新</div>
    <div class="muted" style="margin-bottom:10px">YouTube からダウンロードした曲の、タイトル・アーティスト・アートワークを取り直します（自分で編集した内容も上書きされます）。</div>
    ${bulk ? `<div class="muted">更新中… ${bulk.done} / ${bulk.total}</div><div class="prog"><div style="width:${bulk.done / bulk.total * 100}%"></div></div>`
      : `<button class="btn sm" data-act="refresh-all" ${i.ready ? "" : "disabled"}>${icon("reload", "s")}まとめて更新</button>`}</div>
    <div class="card"><div class="h2">このアプリについて</div><div class="muted">ミュージックルーム（Android 版 ${esc(i.app || "")}）。私的利用の範囲でのみ使用してください。著作権者が許可していない曲の再配布・アップロードはしないでください。曲のファイルはこの端末の中だけに保存されます。</div></div>`;
}

// ============================================================ プレイヤー表示
function renderMini() {
  const t = player.current, el = $("#mini");
  if (!t) { el.classList.remove("show"); renderNav(); return; }
  el.classList.add("show");
  el.innerHTML = `${artHtml(t)}<div class="grow" data-act="np-open"><div class="t-title" style="font-weight:700">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}</div></div>
    <button class="icon-btn" data-act="toggle">${icon(player.playing ? "pause" : "play", "", !player.playing)}</button>
    <button class="icon-btn" data-act="next">${icon("next", "", true)}</button><div class="bar" id="mini-bar"></div>`;
  hydrateArt(el);
  renderNav();
  if ($("#np").classList.contains("show")) renderNp();
}

function renderNp() {
  const t = player.current, el = $("#np");
  if (!t) return el.classList.remove("show");
  const fresh = S.tracks.find(x => x.key === t.key) || t;
  el.innerHTML = `<div class="row"><button class="icon-btn" data-act="np-close">${icon("down")}</button><div class="grow muted" style="text-align:center">再生中</div>
    <button class="icon-btn" data-act="track-menu" data-key="${esc(t.key)}">${icon("more")}</button></div>
    ${artHtml(t, "big")}
    <div class="row"><div class="grow"><div class="ttl">${esc(t.title)}</div><div class="muted" style="font-size:15px">${esc(t.artist)}</div></div>
      <button class="icon-btn ${fresh.liked ? "" : "dim"}" data-act="like" data-key="${esc(t.key)}">${icon("heart", "l", !!fresh.liked)}</button></div>
    <input type="range" id="seek" min="0" max="1000" value="0" style="margin-top:16px">
    <div class="row muted"><span id="t-pos">0:00</span><span class="grow"></span><span id="t-dur">${L.fmtTime(t.duration)}</span></div>
    <div class="ctrl"><button class="icon-btn ${player.shuffle ? "" : "dim"}" data-act="shuffle">${icon("shuffle")}</button>
      <button class="icon-btn" data-act="prev">${icon("prev", "l", true)}</button>
      <button class="play" data-act="toggle">${icon(player.playing ? "pause" : "play", "l", !player.playing)}</button>
      <button class="icon-btn" data-act="next">${icon("next", "l", true)}</button>
      <button class="icon-btn ${player.repeat ? "" : "dim"}" data-act="repeat">${icon(player.repeat === 2 ? "repeat1" : "repeat")}</button></div>`;
  hydrateArt(el);
  const seek = $("#seek");
  seek.addEventListener("input", () => { seek.dataset.drag = 1; seek.style.setProperty("--p", seek.value / 10 + "%"); });
  seek.addEventListener("change", () => { delete seek.dataset.drag; player.seek(seek.value / 1000 * (player.audio.duration || 0)); });
}

function onTime({ pos, dur }) {
  const p = dur ? pos / dur * 100 : 0;
  const bar = $("#mini-bar"); if (bar) bar.style.width = p + "%";
  const seek = $("#seek");
  if (seek && !seek.dataset.drag) { seek.value = p * 10; seek.style.setProperty("--p", p + "%"); }
  const a = $("#t-pos"), b = $("#t-dur");
  if (a) a.textContent = L.fmtTime(pos);
  if (b && dur) b.textContent = L.fmtTime(dur);
}

// ============================================================ 操作
function bindInputs() {
  const s = $("#search");
  if (s) s.addEventListener("input", () => { S.search = s.value; const pos = s.selectionStart; render(); const n = $("#search"); n.focus(); n.setSelectionRange(pos, pos); });
  const y = $("#year"); if (y) y.addEventListener("change", () => { S.year = +y.value; render(); });
  const u = $("#dl-url"); if (u) u.addEventListener("input", () => (S.dl.url = u.value));
  const br = $("#dl-br"); if (br) br.addEventListener("change", () => (S.dl.bitrate = br.value));
  const np = $("#dl-nopl"); if (np) np.addEventListener("change", () => (S.dl.noplaylist = np.checked));
  const su = $("#server-url"); if (su) su.addEventListener("change", async () => { await setting("server", su.value.trim()); pingServer(); });
}

const ACTIONS = {
  nav: d => {
    if (d.id === "browser") return openBrowser("");
    S.page = d.id; S.openPl = null; S.editPl = false; render(); $("#page").scrollTop = 0; if (d.id === "settings") pingServer(); },
  "lib-tab": d => { S.libTab = d.id; render(); },
  "play-row": d => player.playTracks(listCache, +d.i),
  "play-list": d => player.playTracks(listCache, 0, { shuffle: !!d.shuffle }),
  like: async d => { const t = S.tracks.find(x => x.key === d.key); if (!t) return; t.liked = t.liked ? 0 : 1; await saveTrack(t); render(); renderMini(); },
  "track-menu": d => trackMenu(d.key),
  import: () => (Native.isNative ? Native.N.importFiles() : $("#filepick").click()),
  "pl-new": async () => {
    const name = await prompt_("新しいプレイリスト");
    if (name) { await savePlaylist({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 20), name, items: [], created: Date.now(), deleted: 0 }); render(); }
  },
  "pl-open": d => { S.openPl = d.id; S.editPl = false; render(); },
  "pl-close": () => { S.openPl = null; S.editPl = false; render(); },
  "pl-edit": () => { S.editPl = !S.editPl; render(); },
  "pl-menu": async () => {
    const p = S.playlists.find(x => x.id === S.openPl);
    const c = await sheet(p.name, [{ label: "並べ替え・削除", icon: "edit", id: "edit" }, { label: "名前を変更", icon: "edit", id: "rename" },
      { label: "プレイリストを削除", icon: "trash", id: "del" }]);
    if (!c) return;
    if (c.id === "edit") { S.editPl = true; render(); }
    if (c.id === "rename") { const n = await prompt_("名前を変更", p.name); if (n) { p.name = n; await savePlaylist(p); render(); } }
    if (c.id === "del" && await confirm_(`「${p.name}」を削除しますか？\n（曲のファイルは削除されません）`, "削除")) {
      p.deleted = 1; await savePlaylist(p); S.openPl = null; render();
    }
  },
  "pl-move": async d => {
    const p = S.playlists.find(x => x.id === S.openPl), i = +d.i, j = i + +d.d;
    if (j < 0 || j >= p.items.length) return;
    [p.items[i], p.items[j]] = [p.items[j], p.items[i]];
    await savePlaylist(p); render();
  },
  "pl-remove": async d => { const p = S.playlists.find(x => x.id === S.openPl); p.items.splice(+d.i, 1); await savePlaylist(p); render(); },
  "mix-play": d => player.playTracks(S.mix, +d.i, { shuffle: false, radio: async () => L.personalMix(localTracks(), S.plays, 20, Math.random()) }),
  "mix-redo": () => { S.mixSeed = Math.random(); render(); },
  "mix-save": async () => {
    if (!S.mix.length) return toast("保存する曲がありません");
    const name = `あなたへのミックス ${new Date().toLocaleDateString("ja-JP")}`;
    await savePlaylist({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 20), name, items: S.mix.map(t => t.key), created: Date.now(), deleted: 0 });
    toast(`「${name}」を保存しました`);
  },
  radio: d => {
    const list = L.moodTracks(localTracks(), d.id);
    if (!list.length) return toast("当てはまる曲がありません。「YouTube で探す」から追加できます");
    player.playTracks(list, 0, { shuffle: true, radio: async () => L.shuffle(L.moodTracks(localTracks(), d.id)) });
    toast(`${L.MOODS[d.id].label} ラジオを再生します`);
  },
  "mood-save": async d => {
    const list = L.moodTracks(localTracks(), d.id);
    if (!list.length) return toast("保存する曲がありません");
    await savePlaylist({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 20), name: L.MOODS[d.id].label, items: list.map(t => t.key), created: Date.now(), deleted: 0 });
    toast(`「${L.MOODS[d.id].label}」を保存しました`);
  },
  "mood-yt": d => {
    const q = encodeURIComponent(L.MOODS[d.id].query);
    Native.isNative ? openBrowser("https://m.youtube.com/results?search_query=" + q)
      : window.open("https://www.youtube.com/results?search_query=" + q, "_blank");
  },
  "open-browser": () => openBrowser(""),
  "refresh-all": () => refreshAll(),
  bar: d => toast(d.tip, 1600),
  theme: async d => { await setting("theme", d.id); setTheme(d.id); render(); },
  login: () => cloud.signIn().catch(e => toast("ログインできません: " + (e.code || e.message))),
  logout: async () => { await cloud.signOut(); render(); },
  sync: () => cloud.sync(),
  ping: async () => { toast((await pingServer()) ? "サーバーに接続しました" : "サーバーが見つかりません"); },
  "open-termux": () => { location.href = "intent:#Intent;package=com.termux;end"; },
  "ytdl-update": async () => {
    toast("yt-dlp を更新しています…", 8000);
    try {
      const r = await downloader.update();
      toast(!r.ok ? "更新に失敗しました" : Native.isNative ? `更新しました（yt-dlp ${r.version || ""}）` : "更新しました。Termux で ytdl を起動し直してください", 6000);
      if (S.page === "settings") render();
    }
    catch (e) { toast("更新に失敗しました"); }
  },
  install: async () => { if (installEvt) { installEvt.prompt(); installEvt = null; render(); } },
  "dl-paste": async () => {
    try { S.dl.url = (await navigator.clipboard.readText()).trim(); render(); } catch (e) { toast("貼り付けできませんでした。長押しで貼り付けてください"); }
  },
  "dl-mode": d => { S.dl.mode = d.id; render(); },
  "dl-start": () => startDownload(),
  "dl-cancel": d => { const j = downloader.jobs.find(x => x.id === d.id); if (j) downloader.cancel(j); },
  toggle: () => player.toggle(),
  next: () => player.next(),
  prev: () => player.prev(),
  shuffle: () => player.setShuffle(!player.shuffle),
  repeat: () => player.cycleRepeat(),
  "np-open": () => { $("#np").classList.add("show"); renderNp(); history.pushState({ np: 1 }, ""); },
  "np-close": () => { $("#np").classList.remove("show"); if (history.state?.np) history.back(); },
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || !el.dataset.act) return;
  const f = ACTIONS[el.dataset.act];
  if (f) { e.stopPropagation(); f(el.dataset); }
});

// ============================================================ 起動
async function main() {
  S.settings = await db.getMeta("settings", {}) || {};
  setTheme(S.settings.theme || "lightsout");
  device = await db.getMeta("device");
  if (!device) { device = "m-" + crypto.randomUUID().slice(0, 8); await db.setMeta("device", device); }
  await loadAll();

  player = Native.isNative ? new Native.NativePlayer(device) : new Player(device);
  player.addEventListener("track", () => { renderMini(); if (S.page === "library") render(); });
  player.addEventListener("state", renderMini);
  player.addEventListener("mode", () => { if ($("#np").classList.contains("show")) renderNp(); });
  player.addEventListener("time", e => onTime(e.detail));
  player.addEventListener("played", e => {
    const i = S.plays.findIndex(p => p.id === e.detail.id);
    if (i >= 0) S.plays[i] = e.detail; else S.plays.push(e.detail);
    cloud?.schedule();
  });
  player.addEventListener("error", e => toast(`再生できません: ${e.detail.title}`));
  player.addEventListener("empty", () => { const l = localTracks(); if (l.length) player.playTracks(l, 0, { shuffle: true }); });

  downloader = Native.isNative ? new Native.NativeDownloader(registerNative)
    : new Downloader(() => S.settings.server, async (item, audio, thumb) => {
      await addTrack({ blob: audio, ext: item.ext, title: item.title, artist: item.artist, duration: item.duration,
        videoId: item.video_id, tags: item.tags, thumb });
      if (S.page === "library") render();
    });
  downloader.addEventListener("change", () => { if (S.page === "download") render(); else renderNav(); });

  $("#fab").addEventListener("click", () => {
    if (S.page !== "download") { S.page = "download"; render(); pingServer(); }
    else startDownload();
  });
  $("#filepick").addEventListener("change", e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importFiles(f); });
  $("#artpick").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f || !artTarget) return;
    const name = `${artTarget.key}-${Date.now()}.jpg`;
    await db.writeFile("art", name, f);
    await setArt(artTarget, name);
    toast("アートワークを変更しました");
  });
  window.addEventListener("popstate", () => $("#np").classList.remove("show"));
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.page === "settings") render(); });

  // 共有メニューから開かれたとき（YouTube アプリ →「共有」→ このアプリ）
  const q = new URLSearchParams(location.search);
  let shared = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").match(/https?:\/\/\S+/);
  if (Native.isNative) {
    const u = Native.N.sharedUrl();
    if (u) shared = [u];
    // アプリを開いている間に「共有」されたとき
    Native.on("shared", async d => {
      S.page = "download"; S.dl.url = d.url; render();
      if (await pingServer()) startDownload();
    });
    Native.on("imported", d => importNative(d.items || []));
    Native.on("art", async d => {
      const t = S.tracks.find(x => x.key === d.key);
      if (t && d.art) { await setArt(t, d.art); toast("アートワークを変更しました"); }
    });
  }
  if (shared) { S.page = "download"; S.dl.url = shared[0]; history.replaceState(null, "", location.pathname); }

  render();
  renderMini();
  pingServer().then(ok => { if (ok && shared) startDownload(); });

  if (Native.isNative) { queueAnalysis(); return; }   // アプリ版は同期・Service Worker を使わない
  cloud = new Cloud(device);
  for (const ev of ["user", "status"]) cloud.addEventListener(ev, () => { if (S.page === "settings") render(); });
  cloud.addEventListener("changed", async () => { await loadAll(); if (["library", "review", "mix"].includes(S.page)) render(); });
  cloud.lastSync = await db.getMeta("lastSync", 0);
  cloud.init().then(() => { if (S.page === "settings") render(); });

  queueAnalysis();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

main();
