package io.github.pennenn.musicroom

import android.app.Application
import android.content.Context
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

/** アプリ起動時に yt-dlp（Python 込み）と ffmpeg を準備する。ダウンロードはアプリ全体で 1 つ */
class App : Application() {
    /** ダウンロードの進み具合を受け取る画面（メイン画面・ブラウザ） */
    val listeners = CopyOnWriteArraySet<(String, JSONObject) -> Unit>()
    val downloader by lazy { Downloader { type, data -> listeners.forEach { it(type, data) } } }

    override fun onCreate() {
        super.onCreate()
        instance = this
        mediaDir.mkdirs()
        thread(name = "ytdl-init") {
            try {
                YoutubeDL.getInstance().init(this)
                FFmpeg.getInstance().init(this)
                ready = true
            } catch (e: Throwable) {
                initError = e.message ?: e.toString()
            } finally {
                readyLatch.countDown()
            }
        }
    }

    /** 曲とアートワークの保存先（アプリ専用の領域） */
    val mediaDir: File get() = File(filesDir, "media")

    companion object {
        lateinit var instance: App
        @Volatile var ready = false
        @Volatile var initError: String? = null
        val readyLatch = CountDownLatch(1)
    }
}

/** 画面がまだ受け取っていない記録（再生履歴・保存した曲）を端末に置いておく */
object Pending {
    @Synchronized fun add(ctx: Context, name: String, rec: JSONObject) {
        val sp = ctx.getSharedPreferences("pending", Context.MODE_PRIVATE)
        val arr = JSONArray(sp.getString(name, "[]"))
        arr.put(rec)
        sp.edit().putString(name, arr.toString()).commit()
    }

    @Synchronized fun take(ctx: Context, name: String): String {
        val sp = ctx.getSharedPreferences("pending", Context.MODE_PRIVATE)
        val s = sp.getString(name, "[]") ?: "[]"
        sp.edit().putString(name, "[]").commit()
        return s
    }
}
