package io.github.pennenn.musicroom

import android.app.Application
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import java.io.File
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

/** アプリ起動時に yt-dlp（Python 込み）と ffmpeg を準備する */
class App : Application() {
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
