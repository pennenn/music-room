package io.github.pennenn.musicroom

import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.concurrent.thread

/** yt-dlp でダウンロードして、アプリの保存領域に入れる。進み具合は emit で画面に伝える */
class Downloader(private val emit: (String, JSONObject) -> Unit) {
    private val running = mutableSetOf<String>()

    fun start(url: String, mode: String, bitrate: Int, noPlaylist: Boolean): String {
        val id = UUID.randomUUID().toString().take(10)
        running += id
        thread(name = "dl-$id") { run(id, url, mode, bitrate, noPlaylist) }
        return id
    }

    fun cancel(id: String) {
        YoutubeDL.getInstance().destroyProcessById(id)
    }

    private fun job(id: String) = JSONObject().put("id", id)

    private fun run(id: String, url: String, mode: String, bitrate: Int, noPlaylist: Boolean) {
        val app = App.instance
        val tmp = File(app.cacheDir, "dl-$id").apply { mkdirs() }
        val seen = mutableSetOf<String>()
        var saved = 0
        var index = 0
        var count = 0
        var lastEmit = 0L
        emit("job", job(id).put("status", "running").put("progress", 0).put("stage", "準備中"))
        App.readyLatch.await()
        if (!App.ready) {
            emit("job", job(id).put("status", "error").put("error", "yt-dlp を準備できませんでした: ${App.initError}"))
            return
        }

        fun handleLine(line: String) {
            val m = Regex("""Downloading item (\d+) of (\d+)""").find(line)
            if (m != null) { index = m.groupValues[1].toInt(); count = m.groupValues[2].toInt() }
            if (!line.startsWith("{")) return
            val info = try { JSONObject(line) } catch (e: Exception) { return }
            val path = info.optString("filepath")
            val vid = info.optString("id")
            if (path.isEmpty() || !seen.add(path)) return
            val src = File(path)
            if (!src.exists()) return
            val ext = src.extension.ifEmpty { "m4a" }
            val key = if (vid.isNotEmpty()) "yt-$vid" else "f-" + UUID.randomUUID().toString().take(12)
            val dst = File(app.mediaDir, "$key.$ext")
            dst.delete()
            if (!src.renameTo(dst)) { src.copyTo(dst, overwrite = true); src.delete() }
            var art = ""
            val thumb = info.optString("thumbnail")
            if (thumb.isNotEmpty()) {
                try {
                    val c = URL(thumb).openConnection() as HttpURLConnection
                    c.connectTimeout = 10000; c.readTimeout = 15000
                    c.inputStream.use { inp -> File(app.mediaDir, "$key.jpg").outputStream().use { inp.copyTo(it) } }
                    art = "$key.jpg"
                } catch (e: Exception) { /* アートワークなし */ }
            }
            val artist = listOf("artist", "creator", "uploader", "channel").map { info.optString(it) }
                .firstOrNull { it.isNotEmpty() && it != "null" }?.replace(Regex("""\s*-\s*Topic$"""), "") ?: ""
            val tags = (info.optJSONArray("tags")?.let { a -> (0 until minOf(a.length(), 30)).map { a.optString(it) } } ?: emptyList()) +
                (info.optJSONArray("categories")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList())
            saved++
            emit("saved", JSONObject()
                .put("job", id).put("file", dst.name).put("art", art).put("ext", ext).put("size", dst.length())
                .put("title", info.optString("track").ifEmpty { info.optString("title") })
                .put("artist", artist).put("duration", info.optDouble("duration", 0.0))
                .put("video_id", vid).put("tags", tags.joinToString(" ").take(2000)))
        }

        val req = YoutubeDLRequest(url)
        req.addOption("-o", tmp.absolutePath + "/%(id)s.%(ext)s")
        req.addOption("--no-mtime")
        req.addOption("-i")   // プレイリストで失敗した動画があっても続ける
        req.addOption(if (noPlaylist) "--no-playlist" else "--yes-playlist")
        if (mode == "mp3") {
            req.addOption("-x")
            req.addOption("--audio-format", "mp3")
            req.addOption("--audio-quality", "${bitrate}K")
            req.addOption("--embed-metadata")
        } else {
            req.addOption("-f", "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio")
        }
        req.addOption("--print",
            "after_move:%(.{id,title,track,artist,creator,uploader,channel,duration,thumbnail,tags,categories,filepath})j")
        req.addOption("--progress")
        req.addOption("--newline")
        var error = ""
        try {
            val res = YoutubeDL.getInstance().execute(req, id) { progress, _, line ->
                handleLine(line)
                val now = System.currentTimeMillis()
                if (now - lastEmit > 400) {
                    lastEmit = now
                    emit("job", job(id).put("status", "running").put("progress", progress.toDouble())
                        .put("index", index).put("count", count).put("saved", saved)
                        .put("stage", if (progress >= 100f) "変換中" else "ダウンロード中"))
                }
            }
            res.out.lineSequence().forEach { handleLine(it) }
        } catch (e: YoutubeDL.CanceledException) {
            error = "cancelled"
        } catch (e: Exception) {
            error = (e.message ?: e.toString()).lines().lastOrNull { it.contains("ERROR") } ?: (e.message ?: "失敗しました")
        } finally {
            tmp.deleteRecursively()
            running -= id
        }
        val status = when {
            error == "cancelled" -> "cancelled"
            saved > 0 -> "done"
            else -> "error"
        }
        emit("job", job(id).put("status", status).put("progress", 100).put("saved", saved)
            .put("error", if (status == "error") error.ifEmpty { "ダウンロードできませんでした（yt-dlp を更新してみてください）" }
                          else if (error.isNotEmpty() && status == "done") "一部失敗: $error".take(300) else ""))
    }

    companion object {
        fun update(): JSONObject = try {
            App.readyLatch.await()
            val st = YoutubeDL.getInstance().updateYoutubeDL(App.instance, YoutubeDL.UpdateChannel._STABLE)
            JSONObject().put("ok", true).put("status", st?.name ?: "")
                .put("version", YoutubeDL.getInstance().version(App.instance) ?: "")
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.message ?: e.toString())
        }
    }
}
