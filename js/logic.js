// ムード判定・おすすめミックス・振り返り集計・音の解析（PC 版の music_library.py と同じ考え方）
export const PLAY_MIN_SECONDS = 30;

export const MOODS = {
  focus: { label: "集中・作業用", desc: "穏やかなテンポで邪魔にならない曲", query: "作業用BGM 集中 プレイリスト",
    bpm: [60, 112], energy: [0.15, 0.6],
    words: ["作業用", "勉強", "集中", "study", "focus", "lofi", "lo-fi", "bgm", "piano", "ピアノ", "ambient",
      "instrumental", "インスト", "jazz", "ジャズ", "cafe", "カフェ", "classical", "クラシック"] },
  workout: { label: "ワークアウト", desc: "テンポが速くエネルギッシュな曲", query: "ワークアウト 音楽 プレイリスト",
    bpm: [118, 185], energy: [0.6, 1.0],
    words: ["workout", "ワークアウト", "筋トレ", "トレーニング", "gym", "running", "ランニング", "edm", "rock", "ロック",
      "metal", "メタル", "hip hop", "hiphop", "ヒップホップ", "dance", "ダンス", "ハイテンション", "盛り上が"] },
  relax: { label: "リラックス", desc: "ゆったりと落ち着ける曲", query: "リラックス 音楽 プレイリスト",
    bpm: [50, 98], energy: [0.0, 0.45],
    words: ["relax", "リラックス", "healing", "ヒーリング", "癒し", "chill", "チル", "sleep", "睡眠", "acoustic",
      "アコースティック", "ballad", "バラード", "自然音", "雨音", "calm", "meditation", "瞑想"] },
  commute: { label: "通勤・通学", desc: "ほどよいテンポで気分が上がる曲", query: "通勤 音楽 プレイリスト",
    bpm: [95, 135], energy: [0.45, 0.85],
    words: ["pop", "ポップ", "j-pop", "jpop", "city pop", "シティポップ", "ドライブ", "drive", "通勤", "通学",
      "anime", "アニソン", "op", "主題歌", "mv", "official"] },
};

// ---------- 曲の共通 ID（PC と携帯で同じ曲を同じ ID にする）
function norm(s) { return String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, ""); }
export async function trackKey(videoId, title, artist) {
  if (videoId) return "yt-" + videoId;
  const data = new TextEncoder().encode(norm(title) + "|" + norm(artist));
  const buf = await crypto.subtle.digest("SHA-1", data);
  return "h-" + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function guessFromFilename(name) {
  let base = name.replace(/\.[^.]+$/, "").replace(/^\d{1,4}\s*-\s*/, "").replace(/\s*\[[\w-]{11}\]$/, "");
  if (base.includes(" - ")) {
    const [artist, ...rest] = base.split(" - ");
    return { title: rest.join(" - ").trim(), artist: artist.trim() };
  }
  return { title: base.trim(), artist: "" };
}

// ---------- 乱数（同じ日は同じミックスにするため種付き）
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- ムード
function rangeScore(v, lo, hi, soft) {
  if (v == null || isNaN(v)) return 0;
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return Math.max(0, 1 - d / soft);
}

export function moodScores(t) {
  const text = `${t.title} ${t.artist} ${t.tags || ""}`.toLowerCase();
  const out = {};
  for (const [key, m] of Object.entries(MOODS)) {
    let s = Math.min(m.words.filter(w => text.includes(w)).length, 3) * 0.6;
    if (t.analyzed === 1) {
      const b = t.bpm;
      const bs = Math.max(rangeScore(b, m.bpm[0], m.bpm[1], 15), rangeScore(b * 2, m.bpm[0], m.bpm[1], 15) * 0.6,
        rangeScore(b / 2, m.bpm[0], m.bpm[1], 15) * 0.6);
      s += bs * 0.8 + rangeScore(t.energy, m.energy[0], m.energy[1], 0.2);
    }
    if (key === "focus" && (t.duration || 0) > 1200) s += 0.5;
    if (t.mood) s += t.mood === key ? 3 : -1;
    out[key] = s;
  }
  return out;
}

export function topMood(t) {
  const sc = moodScores(t);
  const key = Object.keys(sc).reduce((a, b) => (sc[a] >= sc[b] ? a : b));
  return sc[key] >= 1 ? key : null;
}

export function moodTracks(tracks, key, limit = 60) {
  return tracks.map(t => [moodScores(t)[key], t]).filter(([s]) => s >= 1)
    .sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, t]) => t);
}

// ---------- 再生の統計とおすすめ
export function trackStats(plays) {
  const st = new Map();
  for (const p of plays) {
    const s = st.get(p.key) || { plays: 0, skips: 0, seconds: 0, last: 0 };
    s.seconds += p.seconds || 0;
    s.last = Math.max(s.last, p.at || 0);
    if (p.completed) s.plays++; else if ((p.seconds || 0) < 15) s.skips++;
    st.set(p.key, s);
  }
  return st;
}

export function personalMix(tracks, plays, n = 30, seed = null) {
  if (!tracks.length) return [];
  const rand = rng(seed ?? Math.random());
  const st = trackStats(plays);
  const now = Date.now();
  const aff = new Map();
  for (const t of tracks) {
    const s = st.get(t.key);
    aff.set(t.artist, (aff.get(t.artist) || 0) + (t.liked ? 3 : 0) + (s ? s.plays : 0));
  }
  const maxAff = Math.max(1, ...aff.values());
  const loved = tracks.filter(t => t.analyzed === 1 && (t.liked || ((st.get(t.key) || {}).plays || 0) >= 2));
  const center = loved.length ? [loved.reduce((a, t) => a + t.bpm, 0) / loved.length,
    loved.reduce((a, t) => a + t.energy, 0) / loved.length] : null;
  const scored = tracks.map(t => {
    const s = st.get(t.key) || { plays: 0, skips: 0, last: 0 };
    let score = 2 * (t.liked ? 1 : 0) + 1.5 * aff.get(t.artist) / maxAff + 0.5 * Math.log1p(s.plays);
    if (center && t.analyzed === 1) score += 1.2 * Math.exp(-Math.hypot((t.bpm - center[0]) / 30, (t.energy - center[1]) / 0.25));
    if (s.plays === 0 && now - (t.added || 0) < 30 * 86400e3) score += 1;
    if (now - s.last < 2 * 86400e3) score -= 1;
    const total = s.plays + s.skips;
    if (total) score -= 1.5 * s.skips / total;
    score += rand() * 0.6;
    return [score, t];
  }).sort((a, b) => b[0] - a[0]);
  const out = [], per = new Map();
  for (const [, t] of scored) {
    if ((per.get(t.artist) || 0) >= 3) continue;
    per.set(t.artist, (per.get(t.artist) || 0) + 1);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

// ---------- 振り返り（PC と携帯の再生をまとめて集計）
export function reviewYears(plays) {
  const ys = new Set(plays.map(p => new Date(p.at).getFullYear()));
  ys.add(new Date().getFullYear());
  return [...ys].sort((a, b) => b - a);
}

export function yearReview(plays, tracksByKey, year) {
  const start = new Date(year, 0, 1).getTime(), end = new Date(year + 1, 0, 1).getTime();
  const rows = plays.filter(p => p.at >= start && p.at < end);
  const byTrack = new Map(), byArtist = new Map(), days = new Map(), moods = new Map();
  const months = Array(12).fill(0), hours = Array(24).fill(0);
  let total = 0, count = 0;
  for (const r of rows) {
    const sec = r.seconds || 0;
    total += sec;
    if (r.completed) count++;
    const t = tracksByKey.get(r.key) || { key: r.key, title: r.title, artist: r.artist, analyzed: 0 };
    const bt = byTrack.get(r.key) || { key: r.key, title: t.title || r.title, artist: t.artist || r.artist, plays: 0, seconds: 0, art: t.art };
    bt.plays += r.completed ? 1 : 0; bt.seconds += sec; byTrack.set(r.key, bt);
    const artist = t.artist || r.artist || "不明";
    byArtist.set(artist, (byArtist.get(artist) || 0) + sec);
    const d = new Date(r.at);
    months[d.getMonth()] += sec; hours[d.getHours()] += sec;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.set(day, (days.get(day) || 0) + sec);
    const m = topMood(t);
    if (m) moods.set(MOODS[m].label, (moods.get(MOODS[m].label) || 0) + sec);
  }
  const topDay = [...days.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    year, seconds: total, plays: count, tracks: byTrack.size, artists: byArtist.size,
    topTracks: [...byTrack.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds).slice(0, 10),
    topArtists: [...byArtist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    months, hours, moods: [...moods.entries()].sort((a, b) => b[1] - a[1]), topDay,
    peakHour: total ? hours.indexOf(Math.max(...hours)) : null,
  };
}

// ---------- 表示用
export function fmtTime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export function fmtHours(sec) {
  if (sec > 0 && sec < 60) return `${Math.floor(sec)}秒`;
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
  return h ? `${h}時間 ${m}分` : `${m}分`;
}

// ---------- 音の解析（テンポ・音の強さ・明るさ）
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export async function analyzeBlob(blob, duration) {
  if (blob.size > 40 * 1024 * 1024) return null;   // 長時間の BGM などは解析しない
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const src = audio.getChannelData(0);
  const step = Math.max(1, Math.round(audio.sampleRate / 11025));
  const sr = audio.sampleRate / step;
  const dur = duration || audio.duration;
  const startSec = dur > 60 ? dur / 2 - 22 : 0;
  const s0 = Math.floor(startSec * audio.sampleRate), s1 = Math.min(src.length, s0 + Math.floor(45 * audio.sampleRate));
  const x = new Float32Array(Math.floor((s1 - s0) / step));
  for (let i = 0; i < x.length; i++) x[i] = src[s0 + i * step];
  if (x.length < sr * 5) return null;
  const hop = 256, win = 1024, n = Math.floor((x.length - win) / hop) + 1;
  const rms = new Float32Array(n);
  let mean = 0;
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = 0; i < win; i++) { const v = x[f * hop + i]; s += v * v; }
    rms[f] = Math.sqrt(s / win + 1e-12); mean += rms[f];
  }
  mean /= n;
  const db = 20 * Math.log10(mean + 1e-9);
  const energy = Math.min(1, Math.max(0, (db + 35) / 27));
  // 明るさ（スペクトル重心）
  let num = 0, den = 0;
  const every = Math.max(1, Math.floor(n / 200));
  for (let f = 0; f < n; f += every) {
    const re = new Float32Array(win), im = new Float32Array(win);
    for (let i = 0; i < win; i++) re[i] = x[f * hop + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (win - 1)));
    fft(re, im);
    for (let k = 0; k < win / 2; k++) { const mag = Math.hypot(re[k], im[k]); num += mag * k * sr / win; den += mag; }
  }
  const brightness = Math.min(1, Math.max(0, (num / (den + 1e-9) - 800) / 2200));
  // テンポ（オンセットの自己相関）
  const on = new Float32Array(n - 1);
  let om = 0;
  for (let i = 1; i < n; i++) { on[i - 1] = Math.max(0, Math.log(rms[i] + 1e-6) - Math.log(rms[i - 1] + 1e-6)); om += on[i - 1]; }
  om /= on.length;
  for (let i = 0; i < on.length; i++) on[i] -= om;
  const fps = sr / hop;
  let best = 0, bestBpm = 0;
  for (let lag = Math.ceil(60 * fps / 200); lag <= Math.floor(60 * fps / 55); lag++) {
    let ac = 0;
    for (let i = 0; i + lag < on.length; i++) ac += on[i] * on[i + lag];
    const bpm = 60 * fps / lag;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.9) ** 2);
    if (ac * w > best) { best = ac * w; bestBpm = bpm; }
  }
  if (!bestBpm) return null;
  return { bpm: Math.round(bestBpm * 10) / 10, energy: Math.round(energy * 1000) / 1000, brightness: Math.round(brightness * 1000) / 1000 };
}
