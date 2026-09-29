#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "============================================================"
echo "🚀 JAKOŚĆ I AUDYT (IFS FOOD v8) - UDOSTĘPNIANIE DO INTERNETU"
echo "============================================================"

# Wybór interpretera
if [ -d "venv" ]; then
    UVICORN="./venv/bin/uvicorn"
else
    UVICORN="uvicorn"
fi

# Sprawdzenie czy port 8080 jest wolny i ubicie ewentualnych starych procesów
lsof -ti:8080 | xargs kill -9 2>/dev/null

echo "▶ 1. Uruchamianie serwera aplikacji w tle na porcie 8080..."
$UVICORN main:app --host 0.0.0.0 --port 8080 &
SERVER_PID=$!

cleanup() {
    echo ""
    echo "Zamykanie serwera i tunelu..."
    kill $SERVER_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM EXIT

sleep 2

echo "▶ 2. Generowanie bezpiecznego, publicznego adresu HTTPS (tunel WWW)..."
echo ""
echo "============================================================"
echo "🌐 SKOPIUJ PONIŻSZY LINK I WYŚLIJ GO DOWOLNEJ OSOBIE:"
echo "============================================================"
echo "🔑 DANE LOGOWANIA:"
echo "   👑 Key User (Manager): PIN 9999"
echo "   🔍 Audytor Jakości:    PIN 0000 (lub 1001-1003)"
echo "============================================================"
echo "Aby zakończyć udostępnianie, wciśnij CTRL+C w tym oknie."
echo "============================================================"
echo ""

# Uruchomienie tunelu SSH (wbudowany w macOS, bez instalacji czegokolwiek)
ssh -o StrictHostKeyChecking=no -R 80:localhost:8080 nokey@localhost.run 2>/dev/null || \
ssh -o StrictHostKeyChecking=no -p 443 -R0:localhost:8080 a.pinggy.io
