package io.github.pennenn.musicroom

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject

/** バックグラウンド再生のサービス。ロック画面・通知の操作も Media3 が自動で用意する */
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private var log: PlayLog? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true)                          // ほかのアプリが音を出したら一時停止
            .setHandleAudioBecomingNoisy(true) // イヤホンが抜けたら一時停止
            .build()
        log = PlayLog(this, player).also { player.addListener(it) }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(object : MediaSession.Callback {
                // 画面から送られた曲の場所（requestMetadata.mediaUri）を、再生に使う URI に入れ直す
                override fun onAddMediaItems(
                    mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
                ): ListenableFuture<MutableList<MediaItem>> = Futures.immediateFuture(
                    mediaItems.map { it.buildUpon().setUri(it.requestMetadata.mediaUri).build() }.toMutableList())
            })
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        log?.finish()
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }
}

/** 実際に聴いた時間を曲ごとに記録する（画面が閉じていても失われないよう端末に保存） */
class PlayLog(private val ctx: Context, private val player: Player) : Player.Listener {
    private var cur: MediaItem? = null
    private var startedAt = 0L
    private var acc = 0L
    private var since = 0L   // 再生中になった時刻（停止中は 0）

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        finish()
        begin(mediaItem)
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        val now = SystemClock.elapsedRealtime()
        if (isPlaying) {
            if (cur == null) begin(player.currentMediaItem)
            since = now
        } else if (since > 0) {
            acc += now - since
            since = 0
        }
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) finish()
    }

    private fun begin(item: MediaItem?) {
        cur = item
        startedAt = System.currentTimeMillis()
        acc = 0
        since = if (player.isPlaying) SystemClock.elapsedRealtime() else 0
    }

    fun finish() {
        val item = cur ?: return
        var ms = acc
        if (since > 0) ms += SystemClock.elapsedRealtime() - since
        cur = null; acc = 0; since = 0
        val sec = ms / 1000.0
        if (sec < 1) return
        val dur = item.mediaMetadata.extras?.getDouble("duration") ?: 0.0
        val rec = JSONObject()
            .put("key", item.mediaId)
            .put("title", item.mediaMetadata.title?.toString() ?: "")
            .put("artist", item.mediaMetadata.artist?.toString() ?: "")
            .put("at", startedAt)
            .put("seconds", Math.round(sec * 10) / 10.0)
            .put("completed", if (sec >= 30 || (dur > 0 && sec >= dur * 0.5)) 1 else 0)
        append(ctx, rec)
        onLogged?.invoke()
    }

    companion object {
        @Volatile var onLogged: (() -> Unit)? = null
        private const val PREF = "plays"

        @Synchronized fun append(ctx: Context, rec: JSONObject) {
            val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            val arr = JSONArray(sp.getString("pending", "[]"))
            arr.put(rec)
            sp.edit().putString("pending", arr.toString()).apply()
        }

        /** 画面側が受け取ったら消す */
        @Synchronized fun take(ctx: Context): String {
            val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            val s = sp.getString("pending", "[]") ?: "[]"
            sp.edit().putString("pending", "[]").commit()
            return s
        }
    }
}
