import os
import time
import json
import base64
import hmac
import hashlib
import secrets
from datetime import datetime
from typing import Optional, Dict
from fastapi import HTTPException, Header, Request, Depends, status

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET_KEY_FILE = os.path.join(BASE_DIR, ".secret_key")

def get_or_create_secret_key() -> bytes:
    """Ładuje lub generuje 256-bitowy trwały klucz kryptograficzny serwera."""
    if os.path.exists(SECRET_KEY_FILE):
        try:
            with open(SECRET_KEY_FILE, "rb") as f:
                key = f.read().strip()
                if len(key) >= 32:
                    return key
        except Exception:
            pass
    # Generuj nowy bezpieczny klucz
    new_key = secrets.token_bytes(32)
    # Zabezpiecz uprawnienia pliku klucza (tylko właściciel procesu 0600)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    mode = 0o600
    try:
        fd = os.open(SECRET_KEY_FILE, flags, mode)
        with os.fdopen(fd, "wb") as f:
            f.write(new_key)
    except Exception:
        with open(SECRET_KEY_FILE, "wb") as f:
            f.write(new_key)
        try:
            os.chmod(SECRET_KEY_FILE, 0o600)
        except Exception:
            pass
    return new_key

SECRET_KEY = get_or_create_secret_key()

# =====================================================================
# 1. KRYPTOGRAFICZNE HASZOWANIE HASEŁ / PIN (ISO 27001 A.8.24, A.5.17)
# =====================================================================
PBKDF2_ITERATIONS = 310000  # Rekomendacja OWASP dla PBKDF2-HMAC-SHA256

def hash_pin(pin: str) -> str:
    """Haszuje kod PIN przy użyciu PBKDF2-HMAC-SHA256 z 16-bajtową losową solą."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', pin.strip().encode('utf-8'), salt, PBKDF2_ITERATIONS)
    salt_hex = salt.hex()
    hash_hex = dk.hex()
    return f"$pbkdf2-sha256${PBKDF2_ITERATIONS}${salt_hex}${hash_hex}"

def verify_pin(plain_pin: str, stored_value: str) -> bool:
    """
    Weryfikuje PIN w czasie stałym (constant-time).
    Obsługuje format $pbkdf2-sha256$ oraz chwilowo tekst jawny dla przezroczystej migracji.
    """
    if not stored_value or not plain_pin:
        return False
    
    clean_plain = plain_pin.strip()
    
    if stored_value.startswith("$pbkdf2-sha256$"):
        parts = stored_value.split("$")
        if len(parts) != 5:
            return False
        try:
            iterations = int(parts[2])
            salt = bytes.fromhex(parts[3])
            expected_hash = parts[4]
            dk = hashlib.pbkdf2_hmac('sha256', clean_plain.encode('utf-8'), salt, iterations)
            return hmac.compare_digest(dk.hex(), expected_hash)
        except Exception:
            return False
    else:
        # Fallback na plaintext dla automatycznej migracji
        return hmac.compare_digest(clean_plain, stored_value.strip())

# =====================================================================
# 2. TOKENY SESYJNE BEARER HMAC-SHA256 (ISO 27001 A.5.15, A.5.18)
# =====================================================================
TOKEN_EXPIRY_HOURS = 12

def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def _b64decode(data: str) -> bytes:
    rem = len(data) % 4
    if rem > 0:
        data += '=' * (4 - rem)
    return base64.urlsafe_b64decode(data)

def create_access_token(user: dict, expires_hours: int = TOKEN_EXPIRY_HOURS) -> str:
    """Tworzy kryptograficznie podpisany token sesyjny w formacie URL-safe."""
    now = int(time.time())
    payload = {
        "uid": user["id"],
        "sub": user["full_name"],
        "role": user["role"],
        "iat": now,
        "exp": now + (expires_hours * 3600),
        "nonce": secrets.token_hex(8)
    }
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    payload_b64 = _b64encode(payload_bytes)
    
    signature = hmac.new(SECRET_KEY, payload_b64.encode('utf-8'), hashlib.sha256).digest()
    sig_b64 = _b64encode(signature)
    
    return f"{payload_b64}.{sig_b64}"

def verify_access_token(token: str) -> dict:
    """Weryfikuje podpis i czas ważności tokenu. Rzuca HTTPException w razie fałszerstwa."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Brak tokenu autoryzacyjnego")
    
    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy format tokenu sesyjnego")
    
    payload_b64, sig_b64 = parts
    
    # 1. Weryfikacja podpisu w czasie stałym
    expected_sig = hmac.new(SECRET_KEY, payload_b64.encode('utf-8'), hashlib.sha256).digest()
    try:
        actual_sig = _b64decode(sig_b64)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy podpis tokenu")
    
    if not hmac.compare_digest(actual_sig, expected_sig):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Fałszerstwo tokenu autoryzacji")
    
    # 2. Parsowanie zawartości
    try:
        payload_bytes = _b64decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Błąd dekodowania zawartości tokenu")
    
    # 3. Weryfikacja wygaśnięcia
    exp = payload.get("exp", 0)
    if time.time() > exp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesja wygasła. Zaloguj się ponownie")
    
    return payload

# =====================================================================
# 3. ZALEŻNOŚCI FASTAPI DLA KONTROLI DOSTĘPU (RBAC)
# =====================================================================
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Ekstrahuje i weryfikuje użytkownika z nagłówka Authorization: Bearer <token>."""
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wymagana autoryzacja (brak tokenu Bearer)")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy nagłówek autoryzacji. Użyj formatu: Bearer <token>")
    
    return verify_access_token(parts[1])

async def require_manager(user: dict = Depends(get_current_user)) -> dict:
    """Wymaga uprawnień Kierownika Jakości (MANAGER)."""
    if user.get("role") != "MANAGER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dostęp zastrzeżony wyłącznie dla Kierownika Jakości (MANAGER)")
    return user

async def require_auditor_or_manager(user: dict = Depends(get_current_user)) -> dict:
    """Wymaga uprawnień Audytora lub Managera."""
    if user.get("role") not in ["AUDITOR", "MANAGER"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Brak uprawnień audytowych")
    return user

# =====================================================================
# 4. OCHRONA PRZED ATAKAMI BRUTE-FORCE (ISO 27001 A.8.5)
# =====================================================================
_login_failures: Dict[str, list] = {}
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 300  # 5 minut

def check_rate_limit(client_id: str):
    """Sprawdza czy dany klient nie przekroczył dopuszczalnej liczby nieudanych prób logowania."""
    now = time.time()
    failures = _login_failures.get(client_id, [])
    failures = [t for t in failures if now - t < LOCKOUT_WINDOW_SECONDS]
    _login_failures[client_id] = failures
    
    if len(failures) >= MAX_LOGIN_ATTEMPTS:
        remaining = int(LOCKOUT_WINDOW_SECONDS - (now - failures[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Zbyt wiele nieudanych prób logowania (ochrona Brute-Force ISO 27001). Spróbuj ponownie za {remaining} sekund."
        )

def record_login_failure(client_id: str):
    """Rejestruje nieudaną próbę logowania dla danego klienta."""
    now = time.time()
    failures = _login_failures.get(client_id, [])
    failures.append(now)
    _login_failures[client_id] = failures

def reset_login_failures(client_id: str):
    """Czyści historię błędów po poprawnym uwierzytelnieniu."""
    if client_id in _login_failures:
        del _login_failures[client_id]

# =====================================================================
# 5. CENTRALNY REJESTR ZDARZEŃ BEZPIECZEŃSTWA (ISO 27001 A.8.15)
# =====================================================================
async def log_security_event(
    event_type: str,
    user_id: Optional[int] = None,
    user_name: Optional[str] = None,
    ip_address: Optional[str] = None,
    severity: str = "INFO",
    details: Optional[str] = None
):
    """Zapisuje zdarzenie bezpieczeństwa do audytowalnej tabeli security_audit_logs."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        from database import get_db
        async with get_db() as conn:
            await conn.execute("""
                INSERT INTO security_audit_logs (timestamp, event_type, user_id, user_name, ip_address, severity, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (now_str, event_type, user_id, user_name, ip_address, severity, details))
            await conn.commit()
    except Exception as e:
        print(f"[SECURITY LOG ERROR] {now_str} - {event_type}: {e}")
