#!/data/data/com.termux/files/usr/bin/bash
# ミュージックルーム：Termux の初期設定（最初に 1 回だけ）
#   curl -sL https://pennenn.github.io/music-room/termux/setup.sh | bash
set -e
BASE="https://pennenn.github.io/music-room/termux"

echo "== パッケージを入れています（数分かかります）=="
pkg update -y
pkg install -y python ffmpeg nodejs-lts curl

echo "== yt-dlp を入れています =="
pip install -U "yt-dlp[default]"

echo "== サーバーを配置しています =="
curl -sL "$BASE/ytdl_server.py" -o "$HOME/ytdl_server.py"

# 起動用のコマンド「ytdl」
mkdir -p "$PREFIX/bin"
cat > "$PREFIX/bin/ytdl" <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
exec python "$HOME/ytdl_server.py"
EOS
chmod +x "$PREFIX/bin/ytdl"

# 更新用のコマンド「ytdl-update」
cat > "$PREFIX/bin/ytdl-update" <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
pip install -U "yt-dlp[default]"
curl -sL "https://pennenn.github.io/music-room/termux/ytdl_server.py" -o "$HOME/ytdl_server.py"
echo "更新しました。ytdl で起動してください。"
EOS
chmod +x "$PREFIX/bin/ytdl-update"

# Termux:Widget を使う場合のショートカット（ホーム画面から 1 タップで起動）
mkdir -p "$HOME/.shortcuts"
printf '#!/data/data/com.termux/files/usr/bin/bash\nytdl\n' > "$HOME/.shortcuts/ダウンロードサーバー"
chmod +x "$HOME/.shortcuts/ダウンロードサーバー"

echo ""
echo "== 完了 =="
echo "これから「ytdl」と入力すると、ダウンロードサーバーが起動します。"
