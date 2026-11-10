package io.github.pennenn.musicroom

import android.annotation.SuppressLint
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

/** アプリ内ブラウザ：YouTube を見ながら、右下のボタンで表示中の動画をダウンロード */
class BrowserActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var address: EditText
    private lateinit var loadBar: ProgressBar
    private val app get() = App.instance

    private fun color(name: String, def: String) = try { Color.parseColor(intent.getStringExtra(name) ?: def) } catch (e: Exception) { Color.parseColor(def) }
    private val bg by lazy { color("bg", "#000000") }
    private val cText by lazy { color("text", "#E7E9EA") }
    private val cText2 by lazy { color("cText2", "#71767B") }
    private val surface by lazy { color("surface", "#16181C") }
    private val primary by lazy { color("primary", "#EFF3F4") }
    private val onPrimary by lazy { color("onPrimary", "#0F1419") }
    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private val listener: (String, JSONObject) -> Unit = { type, d ->
        runOnUiThread {
            when {
                type == "saved" -> toast("保存しました: ${d.optString("title")}")
                type == "job" && d.optString("status") == "error" -> toast("ダウンロードできませんでした: ${d.optString("error")}".take(120))
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dark = intent.getBooleanExtra("dark", true)

        // 上のバー：閉じる・アドレス・再読み込み
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(6), dp(6), dp(6), dp(6))
            setBackgroundColor(bg)
        }
        bar.addView(iconButton(R.drawable.ic_close, "閉じる") { finish() })
        address = EditText(this).apply {
            setSingleLine(true)
            textSize = 14f
            setTextColor(cText)
            setHintTextColor(cText2)
            hint = "検索、または URL"
            imeOptions = EditorInfo.IME_ACTION_GO
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            setPadding(dp(16), dp(8), dp(16), dp(8))
            background = GradientDrawable().apply { cornerRadius = dp(20).toFloat(); setColor(surface) }
            setOnEditorActionListener { _, id, ev ->
                if (id == EditorInfo.IME_ACTION_GO || ev?.keyCode == KeyEvent.KEYCODE_ENTER) { go(address.text.toString()); true } else false
            }
        }
        bar.addView(address, LinearLayout.LayoutParams(0, dp(40), 1f).apply { marginStart = dp(4); marginEnd = dp(4) })
        bar.addView(iconButton(R.drawable.ic_reload, "再読み込み") { web.reload() })

        loadBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(cText)
            progressBackgroundTintList = ColorStateList.valueOf(bg)
        }

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            setBackgroundColor(bg)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val s = request.url.scheme ?: ""
                    return s != "http" && s != "https"   // YouTube アプリを開こうとするリンクなどは無視してこの中で見る
                }
                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) { setAddress(url) }
                override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) { setAddress(url) }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    loadBar.progress = newProgress
                    loadBar.visibility = if (newProgress >= 100) View.INVISIBLE else View.VISIBLE
                }
            }
        }

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bar, LinearLayout.LayoutParams(-1, -2))
            addView(loadBar, LinearLayout.LayoutParams(-1, dp(3)))
            addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        }
        // 右下のダウンロードボタン
        val fab = ImageButton(this).apply {
            setImageResource(R.drawable.ic_download)
            imageTintList = ColorStateList.valueOf(onPrimary)
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(primary) }
            elevation = dp(6).toFloat()
            contentDescription = "このページをダウンロード"
            setOnClickListener { downloadCurrent() }
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(bg)
            addView(column, FrameLayout.LayoutParams(-1, -1))
            addView(fab, FrameLayout.LayoutParams(dp(58), dp(58), Gravity.BOTTOM or Gravity.END).apply {
                setMargins(0, 0, dp(16), dp(84))   // YouTube の下のメニューに重ならない高さ
            })
        }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        @Suppress("DEPRECATION")
        window.statusBarColor = bg
        @Suppress("DEPRECATION")
        window.navigationBarColor = bg
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }

        onBackPressedDispatcher.addCallback(this) { if (web.canGoBack()) web.goBack() else finish() }
        val start = intent.getStringExtra("url")?.takeIf { it.startsWith("http") } ?: "https://m.youtube.com/"
        web.loadUrl(start)
    }

    private fun iconButton(res: Int, desc: String, onClick: () -> Unit) = ImageButton(this).apply {
        setImageResource(res)
        imageTintList = ColorStateList.valueOf(cText)
        background = null
        contentDescription = desc
        setPadding(dp(10), dp(10), dp(10), dp(10))
        setOnClickListener { onClick() }
    }

    private fun setAddress(url: String) { if (!address.hasFocus()) address.setText(url) }

    private fun go(input: String) {
        val t = input.trim()
        if (t.isEmpty()) return
        val url = when {
            t.startsWith("http://") || t.startsWith("https://") -> t
            t.contains('.') && !t.contains(' ') -> "https://$t"
            else -> "https://m.youtube.com/results?search_query=" + Uri.encode(t)
        }
        web.loadUrl(url)
        address.clearFocus()
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(address.windowToken, 0)
    }

    /** 動画・ショート・プレイリストのページかどうか */
    private fun downloadable(u: Uri): Boolean {
        val host = u.host ?: return false
        val path = u.path ?: ""
        if (host.endsWith("youtu.be")) return path.length > 1
        if (!host.endsWith("youtube.com")) return false
        return path.startsWith("/watch") || path.startsWith("/shorts/") || path.startsWith("/playlist") || path.startsWith("/live/")
    }

    private fun downloadCurrent() {
        val url = web.url ?: return
        val u = Uri.parse(url)
        if (!downloadable(u)) {
            toast("動画のページを開いてから押してください")
            return
        }
        val isPlaylist = u.path?.startsWith("/playlist") == true
        app.downloader.start(url, intent.getStringExtra("mode") ?: "m4a", intent.getIntExtra("bitrate", 192),
            if (isPlaylist) false else intent.getBooleanExtra("noplaylist", true))
        toast(if (isPlaylist) "プレイリストのダウンロードを開始しました" else "ダウンロードを開始しました")
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    override fun onResume() {
        super.onResume()
        web.onResume()
        app.listeners += listener
    }

    override fun onPause() {
        web.onPause()   // ブラウザを閉じたら動画の音を止める
        app.listeners -= listener
        super.onPause()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
