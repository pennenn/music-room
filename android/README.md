# ミュージックルーム（Android アプリ版）

携帯版（PWA）と同じ画面に、yt-dlp を組み込んだ Android アプリです。**私的利用専用**。
Termux も PC も不要で、携帯だけでダウンロード・保存・再生ができます。

| 役割 | 使ったもの |
|---|---|
| 画面 | リポジトリ直下の HTML/JS（ビルド時に `app/src/main/assets/web/` へコピー）を WebView で表示 |
| ダウンロード | youtubedl-android（yt-dlp・Python・ffmpeg 入り） |
| 保存 | アプリ専用の領域（`files/media`）。曲の情報・プレイリスト・再生履歴は WebView の IndexedDB |
| 再生 | Media3（ExoPlayer）の再生サービス。バックグラウンド再生・ロック画面・通知の操作 |
| 再生履歴 | 再生サービスが記録し、画面を開いたときに受け取る（バックグラウンドで聴いた分も残る） |
| 共有 | YouTube アプリの「共有」→「ミュージックルーム」でダウンロード開始 |

## 携帯に入れる

1. PC でビルドした `MusicRoom.apk` を携帯に送る（USB でコピー / Google ドライブ / クイック共有 など）。
2. 携帯でファイルを開き「インストール」。「提供元不明のアプリ」の確認が出たら、開いたアプリ（ファイル・Chrome など）に許可を出す。
3. 「Play プロテクト」の警告が出たら「詳細」→「インストールする」。
4. 初回起動で「通知の許可」を求められたら **許可**（ロック画面・通知での再生操作に使う）。
5. 初回だけ、ダウンロード機能の準備に数十秒かかる。

## PC でビルドする

```
cd C:\Users\penen\Documents\music-room\android
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.21.9-hotspot
gradlew.bat assembleDebug
```

できあがり: `app\build\outputs\apk\debug\app-debug.apk`

- 画面（`index.html`・`js/`）を直したら、もう一度ビルドすると反映される。
- 更新版を入れるときは、同じ PC でビルドしたものを上書きインストールする（署名が同じなので曲やデータはそのまま残る）。
  別の PC でビルドすると署名が変わり、上書きできない（アンインストールが必要＝データが消える）。
  署名の鍵は `C:\Users\penen\.android\debug.keystore`。消さないこと。

## 使い方の注意

- ダウンロードに失敗するようになったら、アプリの「設定 → yt-dlp を更新」。
- 64bit（arm64-v8a）の携帯向け。ほぼすべての最近の Android 携帯が該当する。
- 曲はアプリの中に保存される。アプリをアンインストールすると曲も消える。
