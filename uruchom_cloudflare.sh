#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "============================================================"
echo "🌐 CLOUDFLARE TUNNEL - JAKOŚĆ I AUDYT (IFS FOOD v8)"
echo "============================================================"

# Sprawdzenie czy cloudflared jest zainstalowany
if ! command -v cloudflared &> /dev/null; then
    echo "Pobieranie oficjalnego programu Cloudflare Tunnel dla macOS (Apple Silicon)..."
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64 -o cloudflared
    chmod +x cloudflared
    CF_BIN="./cloudflared"
else
    CF_BIN="cloudflared"
fi

lsof -ti:8080 | xargs kill -9 2>/dev/null

if [ -d "venv" ]; then
    UVICORN="./venv/bin/uvicorn"
else
    UVICORN="uvicorn"
fi

$UVICORN main:app --host 0.0.0.0 --port 8080 &
SERVER_PID=$!

cleanup() {
    kill $SERVER_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM EXIT

sleep 2

echo "▶ Generowanie linku Cloudflare HTTPS..."
$CF_BIN tunnel --url http://localhost:8080
