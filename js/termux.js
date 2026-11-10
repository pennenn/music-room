// Termux のダウンロードサーバー（携帯の中の 127.0.0.1）とのやりとり
export const DEFAULT_SERVER = "http://127.0.0.1:8765";

export class Downloader extends EventTarget {
  constructor(getBase, importItem) {
    super();
    this.getBase = getBase;          // () => サーバーの URL
    this.importItem = importItem;    // async (item, audioBlob, thumbBlob) => 取り込み
    this.jobs = [];                  // {id, url, status, progress, title, imported:Set, error}
  }

  emit() { this.dispatchEvent(new Event("change")); }
  base() { return (this.getBase() || DEFAULT_SERVER).replace(/\/+$/, ""); }

  async ping() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(this.base() + "/api/ping", { signal: ctl.signal });
      clearTimeout(t);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async start(url, opts) {
    const r = await fetch(this.base() + "/api/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode: opts.mode, bitrate: opts.bitrate, noplaylist: opts.noplaylist }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "開始できませんでした");
    const job = { id: data.id, url, status: "queued", progress: 0, title: "", imported: new Set(), error: "", count: 0, index: 0 };
    this.jobs.unshift(job);
    this.emit();
    this._poll(job);
    return job;
  }

  async cancel(job) {
    try { await fetch(`${this.base()}/api/jobs/${job.id}/cancel`, { method: "POST" }); } catch (e) { /* 無視 */ }
  }

  async _poll(job) {
    let fails = 0;
    while (true) {
      let s;
      try {
        const r = await fetch(`${this.base()}/api/jobs/${job.id}`);
        s = await r.json();
        fails = 0;
      } catch (e) {
        if (++fails > 10) { job.status = "error"; job.error = "サーバーとの接続が切れました"; this.emit(); return; }
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      Object.assign(job, { status: s.status, progress: s.progress, title: s.title || job.title, error: s.error,
        count: s.count || 0, index: s.index || 0, stage: s.stage });
      for (const item of s.items || []) {
        if (job.imported.has(item.fid)) continue;
        job.imported.add(item.fid);
        job.saving = true; this.emit();
        try {
          const audio = await (await fetch(`${this.base()}/api/files/${item.fid}`)).blob();
          let thumb = null;
          if (item.thumb) {
            try { thumb = await (await fetch(`${this.base()}/api/files/${item.fid}/thumb`)).blob(); } catch (e) { /* なし */ }
          }
          await this.importItem(item, audio, thumb);
          await fetch(`${this.base()}/api/files/${item.fid}`, { method: "DELETE" });   // サーバー側は消す
          job.saved = (job.saved || 0) + 1;
        } catch (e) {
          job.error = "保存に失敗: " + e.message;
        }
        job.saving = false;
      }
      this.emit();
      if (["done", "error", "cancelled"].includes(s.status) && job.imported.size >= (s.items || []).length) return;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  async update() {
    const r = await fetch(this.base() + "/api/update", { method: "POST" });
    return r.json();
  }
}
