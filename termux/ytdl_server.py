# -*- coding: utf-8 -*-
"""
ミュージックルーム用ダウンロードサーバー（Termux で動かす）  ※私的利用専用

携帯の中だけで動く小さなサーバーです。アプリ（PWA）から URL を受け取り、
yt-dlp で音声をダウンロードして、アプリに渡したら一時ファイルを消します。
外部からは接続できません（127.0.0.1 のみ）。

起動:  python ~/ytdl_server.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

import yt_dlp

VERSION = "1.0"
HOST, PORT = "127.0.0.1", int(os.environ.get("YTDL_PORT", "8765"))
WORK = os.path.join(os.path.expanduser("~"), ".ytdl_tmp")
# このサーバーを使ってよいページ（アプリの公開先と、PC での動作確認用）
ALLOWED_ORIGINS = {"https://pennenn.github.io"}
ALLOWED_LOCAL = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")
FFMPEG = shutil.which("ffmpeg")

jobs = {}     # id -> dict
files = {}    # fid -> dict(path, thumb, job)
lock = threading.Lock()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


class Cancelled(Exception):
    pass


def run_job(job):
    jdir = os.path.join(WORK, job["id"])
    os.makedirs(jdir, exist_ok=True)
    mode = job["mode"] if FFMPEG else "m4a"

    def hook(d):
        if job.get("cancel"):
            raise Cancelled()
        info = d.get("info_dict") or {}
        job["title"] = info.get("title") or job.get("title")
        idx, cnt = info.get("playlist_index"), info.get("n_entries") or info.get("playlist_count")
        if idx and cnt:
            job["index"], job["count"] = idx, cnt
        if d["status"] == "downloading":
            tb = d.get("total_bytes") or d.get("total_bytes_estimate")
            job["progress"] = round(d.get("downloaded_bytes", 0) / tb * 100, 1) if tb else 0
        elif d["status"] == "finished":
            job["progress"] = 100
            job["stage"] = "変換中"

    def pp_hook(d):
        if d["status"] != "finished" or d.get("postprocessor") != "MoveFiles":
            return
        info = d.get("info_dict") or {}
        path = info.get("filepath")
        if not path or not os.path.exists(path):
            return
        fid = uuid.uuid4().hex[:12]
        thumb = None
        if info.get("thumbnail"):
            try:
                with urlopen(info["thumbnail"], timeout=10) as f:
                    thumb = os.path.join(jdir, fid + ".thumb")
                    with open(thumb, "wb") as out:
                        out.write(f.read())
            except Exception:
                thumb = None
        artist = info.get("artist") or info.get("creator") or info.get("uploader") or info.get("channel") or ""
        item = {
            "fid": fid, "title": info.get("track") or info.get("title") or os.path.basename(path),
            "artist": re.sub(r"\s*-\s*Topic$", "", artist).strip(), "duration": info.get("duration") or 0,
            "video_id": info.get("id"), "ext": os.path.splitext(path)[1].lstrip("."),
            "size": os.path.getsize(path), "thumb": bool(thumb),
            "tags": " ".join((info.get("tags") or [])[:30] + (info.get("categories") or []))[:2000],
        }
        with lock:
            files[fid] = {"path": path, "thumb": thumb, "job": job["id"]}
        job["items"].append(item)
        log("saved", item["title"])

    opts = {
        "quiet": True, "no_warnings": True, "noprogress": True,
        "progress_hooks": [hook], "postprocessor_hooks": [pp_hook],
        "ignoreerrors": True, "noplaylist": job["noplaylist"],
        "paths": {"home": jdir}, "outtmpl": "%(id)s.%(ext)s",
        "retries": 10, "fragment_retries": 10,
        "js_runtimes": {"deno": {"path": None}, "node": {"path": None}},
    }
    if mode == "mp3":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3",
                                   "preferredquality": str(job["bitrate"])},
                                  {"key": "FFmpegMetadata"}]
    else:
        opts["format"] = "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"
    job["status"] = "running"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([job["url"]])
        job["status"] = "done" if job["items"] else "error"
        if not job["items"]:
            job["error"] = "ダウンロードできませんでした（URL を確認するか、yt-dlp を更新してください）"
    except Cancelled:
        job["status"] = "cancelled"
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)[:500]
    job["finished_at"] = time.time()
    log("job", job["id"], job["status"])


def cleanup_loop():
    """受け取られなかった一時ファイルを 1 時間で消す"""
    while True:
        time.sleep(300)
        now = time.time()
        with lock:
            for jid, job in list(jobs.items()):
                if job.get("finished_at") and now - job["finished_at"] > 3600:
                    shutil.rmtree(os.path.join(WORK, jid), ignore_errors=True)
                    for fid in [f for f, v in files.items() if v["job"] == jid]:
                        files.pop(fid, None)
                    jobs.pop(jid, None)


class Handler(BaseHTTPRequestHandler):
    server_version = "MusicRoomYtdl/" + VERSION

    def log_message(self, *a):
        pass

    # --- CORS（アプリのページからだけ使えるようにする）
    def _origin_ok(self):
        o = self.headers.get("Origin")
        return o is None or o in ALLOWED_ORIGINS or bool(ALLOWED_LOCAL.match(o))

    def _cors(self):
        o = self.headers.get("Origin")
        if o and self._origin_ok():
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path, ctype):
        size = os.path.getsize(path)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.end_headers()
        with open(path, "rb") as f:
            shutil.copyfileobj(f, self.wfile, 256 * 1024)

    def do_OPTIONS(self):
        self.send_response(204 if self._origin_ok() else 403)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._origin_ok():
            return self._json(403, {"error": "forbidden"})
        p = self.path.split("?")[0].rstrip("/")
        if p == "/api/ping":
            return self._json(200, {"ok": True, "version": VERSION, "ytdlp": yt_dlp.version.__version__,
                                    "ffmpeg": bool(FFMPEG)})
        m = re.match(r"^/api/jobs/(\w+)$", p)
        if m:
            job = jobs.get(m.group(1))
            if not job:
                return self._json(404, {"error": "not found"})
            return self._json(200, {k: v for k, v in job.items() if k != "cancel"})
        m = re.match(r"^/api/files/(\w+)(/thumb)?$", p)
        if m:
            f = files.get(m.group(1))
            if not f:
                return self._json(404, {"error": "not found"})
            if m.group(2):
                if not f["thumb"]:
                    return self._json(404, {"error": "no thumb"})
                return self._file(f["thumb"], "image/jpeg")
            ext = os.path.splitext(f["path"])[1].lower()
            ctype = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webm": "audio/webm",
                     ".opus": "audio/ogg"}.get(ext, "application/octet-stream")
            return self._file(f["path"], ctype)
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._origin_ok():
            return self._json(403, {"error": "forbidden"})
        p = self.path.rstrip("/")
        n = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            data = {}
        if p == "/api/jobs":
            url = str(data.get("url", "")).strip()
            if not re.match(r"^https?://", url):
                return self._json(400, {"error": "URL が正しくありません"})
            job = {"id": uuid.uuid4().hex[:10], "url": url, "mode": data.get("mode", "m4a"),
                   "bitrate": int(data.get("bitrate", 192)), "noplaylist": bool(data.get("noplaylist", True)),
                   "status": "queued", "progress": 0, "items": [], "title": "", "error": "",
                   "created_at": time.time()}
            jobs[job["id"]] = job
            threading.Thread(target=run_job, args=(job,), daemon=True).start()
            log("job", job["id"], url)
            return self._json(200, {"id": job["id"]})
        m = re.match(r"^/api/jobs/(\w+)/cancel$", p)
        if m and m.group(1) in jobs:
            jobs[m.group(1)]["cancel"] = True
            return self._json(200, {"ok": True})
        if p == "/api/update":
            r = subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp[default]"],
                               capture_output=True, text=True)
            return self._json(200, {"ok": r.returncode == 0, "log": (r.stdout + r.stderr)[-1500:],
                                    "restart": True})
        self._json(404, {"error": "not found"})

    def do_DELETE(self):
        if not self._origin_ok():
            return self._json(403, {"error": "forbidden"})
        m = re.match(r"^/api/files/(\w+)$", self.path.rstrip("/"))
        if m:
            with lock:
                f = files.pop(m.group(1), None)
            if f:
                for path in (f["path"], f["thumb"]):
                    if path and os.path.exists(path):
                        os.remove(path)
            return self._json(200, {"ok": True})
        self._json(404, {"error": "not found"})


def main():
    os.makedirs(WORK, exist_ok=True)
    threading.Thread(target=cleanup_loop, daemon=True).start()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"ダウンロードサーバーを起動しました  http://{HOST}:{PORT}   yt-dlp {yt_dlp.version.__version__}"
        f"   ffmpeg: {'あり' if FFMPEG else 'なし（M4A のみ）'}")
    log("このまま開いておいてください。終了は Ctrl + C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
