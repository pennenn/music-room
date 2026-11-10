package io.github.pennenn.musicroom

import android.Manifest
import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.os.bundleOf
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.google.common.util.concurrent.MoreExecutors
import com.yausername.youtubedl_android.YoutubeDL
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import kotlin.concurrent.thread

/** 画面は携帯版（HTML/JS）をそのまま表示し、ダウンロード・再生・ファイル操作をこのクラスが受け持つ */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private val main = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private val pending = mutableListOf<(MediaController) -> Unit>()
    private var sharedUrl: String? = null
    private val mainListener: (String, JSONObject) -> Unit = { type, data -> emit(type, data) }
    private var artKey = ""
    private val app get() = App.instance

    private val picker = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) thread { importUris(uris) }
    }
    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
    // アートワークにする画像を選ぶ
    private val artPicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val key = artKey
        if (uri != null && key.isNotEmpty()) thread {
            try {
                val name = "$key-${System.currentTimeMillis()}.jpg"
                contentResolver.openInputStream(uri)?.use { inp -> File(app.mediaDir, name).outputStream().use { inp.copyTo(it) } }
                emit("art", JSONObject().put("key", key).put("art", name))
            } catch (e: Exception) { emit("art", JSONObject().put("key", key).put("error", e.message ?: "")) }
        }
    }

    private val ticker = object : Runnable {
        override fun run() {
            controller?.let { c ->
                if (c.mediaItemCount > 0) emit("time", JSONObject().put("pos", c.currentPosition / 1000.0)
                    .put("dur", if (c.duration > 0) c.duration / 1000.0 else 0.0))
            }
            main.postDelayed(this, 500)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        app.listeners += mainListener
        web = WebView(this)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(web) }
        setContentView(root)
        // Android 15 以降は画面がステータスバーの下まで広がるので、その分だけ内側に寄せる
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/files/", WebViewAssetLoader.InternalStoragePathHandler(this, app.mediaDir))
            .build()
        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                openExternal(request.url.toString())
                return true
            }
        }
        web.webChromeClient = WebChromeClient()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        web.setBackgroundColor(Color.BLACK)
        web.addJavascriptInterface(Bridge(), "NativeApp")
        handleIntent(intent)
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")

        onBackPressedDispatcher.addCallback(this) {
            if (web.canGoBack()) web.goBack() else moveTaskToBack(true)   // 戻るで閉じても再生は続く
        }
        if (Build.VERSION.SDK_INT >= 33) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        PlayLog.onLogged = { emit("plays", JSONObject()) }
    }

    override fun onDestroy() {
        app.listeners -= mainListener
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        val future = MediaController.Builder(this, token).buildAsync()
        future.addListener({
            val c = future.get()
            controller = c
            c.addListener(listener)
            pending.forEach { it(c) }
            pending.clear()
            emitState(c)
        }, MoreExecutors.directExecutor())
        main.post(ticker)
        emit("plays", JSONObject())
    }

    override fun onStop() {
        main.removeCallbacks(ticker)
        controller?.release()
        controller = null
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
        sharedUrl?.let { emit("shared", JSONObject().put("url", it)); sharedUrl = null }
    }

    // YouTube アプリの「共有」から来た URL
    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = listOfNotNull(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT)).joinToString(" ")
        sharedUrl = Regex("""https?://\S+""").find(text)?.value
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            controller?.let { emit("transition", JSONObject().put("index", it.currentMediaItemIndex)) }
        }
        override fun onIsPlayingChanged(isPlaying: Boolean) { controller?.let { emitState(it) } }
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) emit("ended", JSONObject())
        }
        override fun onPlayerError(error: PlaybackException) {
            emit("perror", JSONObject().put("index", controller?.currentMediaItemIndex ?: -1).put("message", error.message ?: ""))
        }
    }

    private fun emitState(c: MediaController) {
        emit("state", JSONObject().put("playing", c.isPlaying).put("index", c.currentMediaItemIndex)
            .put("count", c.mediaItemCount).put("shuffle", c.shuffleModeEnabled))
    }

    fun emit(type: String, data: JSONObject) {
        val js = "window.nativeEvent && window.nativeEvent(${JSONObject.quote(type)}, ${JSONObject.quote(data.toString())})"
        main.post { if (!isDestroyed) web.evaluateJavascript(js, null) }
    }

    private fun withController(f: (MediaController) -> Unit) = main.post {
        val c = controller
        if (c != null) f(c) else pending += f
    }

    private fun openExternal(url: String) {
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) { /* 開けない */ }
    }

    private fun toItem(o: JSONObject): MediaItem {
        val file = File(app.mediaDir, o.getString("file"))
        val art = o.optString("art").takeIf { it.isNotEmpty() }?.let { File(app.mediaDir, it) }?.takeIf { it.exists() }
        return MediaItem.Builder()
            .setMediaId(o.getString("key"))
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.fromFile(file)).build())
            .setMediaMetadata(MediaMetadata.Builder()
                .setTitle(o.optString("title")).setArtist(o.optString("artist")).setAlbumTitle("ミュージックルーム")
                .setArtworkUri(art?.let { Uri.fromFile(it) })
                .setExtras(bundleOf("duration" to o.optDouble("duration", 0.0)))
                .build())
            .build()
    }

    private fun items(json: String): List<MediaItem> {
        val a = JSONArray(json)
        return (0 until a.length()).map { toItem(a.getJSONObject(it)) }
    }

    // 端末の音楽ファイルを取り込む（アプリの保存領域にコピー）
    private fun importUris(uris: List<Uri>) {
        val out = JSONArray()
        for (uri in uris) {
            try {
                var name = "audio"
                contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                    if (it.moveToFirst()) name = it.getString(0) ?: name
                }
                val ext = name.substringAfterLast('.', "m4a").lowercase().take(5)
                val dst = File(app.mediaDir, "imp-" + UUID.randomUUID().toString().take(12) + "." + ext)
                contentResolver.openInputStream(uri)?.use { inp -> dst.outputStream().use { inp.copyTo(it) } }
                var title = ""; var artist = ""; var dur = 0.0
                try {
                    MediaMetadataRetriever().apply {
                        setDataSource(dst.absolutePath)
                        title = extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE) ?: ""
                        artist = extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST) ?: ""
                        dur = (extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000
                        release()
                    }
                } catch (e: Exception) { /* タグなし */ }
                out.put(JSONObject().put("file", dst.name).put("ext", ext).put("size", dst.length()).put("name", name)
                    .put("title", title).put("artist", artist).put("duration", dur))
            } catch (e: Exception) { /* 読めないファイルは飛ばす */ }
        }
        emit("imported", JSONObject().put("items", out))
    }

    /** 画面（JavaScript）から呼ばれる機能 */
    inner class Bridge {
        @JavascriptInterface fun info(): String = JSONObject()
            .put("ready", App.ready).put("error", App.initError ?: "")
            .put("ytdlp", if (App.ready) YoutubeDL.getInstance().version(app) ?: "" else "")
            .put("ffmpeg", true).put("app", BuildConfigInfo.VERSION).toString()

        @JavascriptInterface fun sharedUrl(): String { val u = sharedUrl ?: ""; sharedUrl = null; return u }

        @JavascriptInterface fun download(url: String, mode: String, bitrate: Int, noPlaylist: Boolean): String =
            app.downloader.start(url, mode, bitrate, noPlaylist)

        @JavascriptInterface fun cancel(id: String) = app.downloader.cancel(id)

        /** ダウンロードで保存したが、まだ画面に登録していない曲 */
        @JavascriptInterface fun takeSaved(): String = Pending.take(app, "saved")

        /** アプリ内ブラウザを開く（テーマの色とダウンロード設定を渡す） */
        @JavascriptInterface fun openBrowser(url: String, theme: String, mode: String, bitrate: Int, noPlaylist: Boolean) {
            val t = try { JSONObject(theme) } catch (e: Exception) { JSONObject() }
            main.post {
                startActivity(Intent(this@MainActivity, BrowserActivity::class.java).apply {
                    putExtra("url", url)
                    for (k in listOf("bg", "text", "text2", "surface", "primary", "onPrimary")) putExtra(k, t.optString(k).ifEmpty { null })
                    putExtra("dark", t.optBoolean("dark", true))
                    putExtra("mode", mode); putExtra("bitrate", bitrate); putExtra("noplaylist", noPlaylist)
                })
            }
        }

        /** YouTube から曲の情報を取り直す（結果は "info" で返す） */
        @JavascriptInterface fun refreshInfo(videoId: String, key: String) {
            thread { emit("info", Downloader.fetchInfo(videoId, key)) }
        }

        /** アートワークにする画像を選ぶ（結果は "art" で返す） */
        @JavascriptInterface fun pickArt(key: String) { artKey = key; main.post { artPicker.launch("image/*") } }

        @JavascriptInterface fun updateYtdlp() { thread { emit("updated", Downloader.update()) } }

        @JavascriptInterface fun importFiles() { main.post { picker.launch(arrayOf("audio/*")) } }

        @JavascriptInterface fun deleteFile(name: String) {
            if (!name.contains('/') && !name.contains("..")) File(app.mediaDir, name).delete()
        }

        @JavascriptInterface fun openUrl(url: String) { main.post { openExternal(url) } }

        @JavascriptInterface fun setBarColor(color: String, dark: Boolean) {
            main.post {
                try {
                    val c = Color.parseColor(color)
                    @Suppress("DEPRECATION")
                    window.statusBarColor = c
                    @Suppress("DEPRECATION")
                    window.navigationBarColor = c
                    WindowCompat.getInsetsController(window, window.decorView).apply {
                        isAppearanceLightStatusBars = !dark
                        isAppearanceLightNavigationBars = !dark
                    }
                    web.setBackgroundColor(c)
                    root.setBackgroundColor(c)   // ステータスバー・ナビゲーションバーの裏の色
                } catch (e: Exception) { /* 色の指定が不正 */ }
            }
        }

        @JavascriptInterface fun takePlays(): String = PlayLog.take(app)

        // ---- 再生
        @JavascriptInterface fun setQueue(json: String, start: Int, shuffle: Boolean) {
            val list = items(json)
            withController { c ->
                c.shuffleModeEnabled = shuffle
                c.setMediaItems(list, start.coerceIn(0, maxOf(0, list.size - 1)), 0)
                c.prepare(); c.play()
            }
        }
        @JavascriptInterface fun insertNext(json: String) {
            val list = items(json)
            withController { c -> c.addMediaItems(minOf(c.currentMediaItemIndex + 1, c.mediaItemCount), list) }
        }
        @JavascriptInterface fun appendAndPlay(json: String) {
            val list = items(json)
            withController { c ->
                val at = c.mediaItemCount
                c.addMediaItems(list)
                c.seekTo(at, 0); c.prepare(); c.play()
            }
        }
        @JavascriptInterface fun toggle() = withController { c -> if (c.isPlaying) c.pause() else { if (c.playbackState == Player.STATE_ENDED) c.seekTo(0, 0); c.prepare(); c.play() } }
        @JavascriptInterface fun next() = withController { it.seekToNextMediaItem() }
        @JavascriptInterface fun prev() = withController { it.seekToPrevious() }
        @JavascriptInterface fun seek(ms: Long) = withController { it.seekTo(ms) }
        @JavascriptInterface fun setRepeat(mode: Int) = withController {
            it.repeatMode = when (mode) { 1 -> Player.REPEAT_MODE_ALL; 2 -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF }
        }
        @JavascriptInterface fun setShuffle(on: Boolean) = withController { it.shuffleModeEnabled = on }
    }
}

object BuildConfigInfo { const val VERSION = "1.1" }
