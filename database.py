import aiosqlite
import os
import shutil
from datetime import datetime
from contextlib import asynccontextmanager

# Obsługa konfiguracji bazy danych (SQLite lub ścieżka zdefiniowana w środowisku)
DB_NAME = os.getenv("DATABASE_PATH", "audits.db")
DB_PATH = DB_NAME

@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(DB_NAME) as conn:
        conn.row_factory = aiosqlite.Row
        yield conn

async def run_migrations_engine(conn):
    """
    Lekki, transakcyjny i wersjonowany silnik migracji schematu bazy danych.
    Zgodny z ISO 27001 oraz zasadą Zero-Regression.
    """
    c = await conn.cursor()
    
    # Utworzenie tabeli historii migracji, jeśli jeszcze nie istnieje
    await c.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            description TEXT
        )
    """)
    await conn.commit()

    # Pobierz już zaaplikowane wersje
    await c.execute("SELECT version FROM schema_migrations ORDER BY version ASC")
    applied_versions = {row[0] for row in await c.fetchall()}

    # Definicje wersji migracji (idempotentne kroki DDL)
    migrations = [
        (
            1,
            "iso27001_security_audit_logs",
            "Utworzenie tabeli security_audit_logs dla kontroli ISO 27001 A.8.15",
            [
                """
                CREATE TABLE IF NOT EXISTS security_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    user_id INTEGER,
                    user_name TEXT,
                    ip_address TEXT,
                    severity TEXT DEFAULT 'INFO',
                    details TEXT
                )
                """
            ]
        ),
        (
            2,
            "performance_indexes_v1",
            "Nałożenie indeksów bazy danych dla przyspieszenia kalendarza, audytów i logów bezpieczeństwa",
            [
                "CREATE INDEX IF NOT EXISTS idx_schedules_date_status ON audit_schedules(scheduled_date, status)",
                "CREATE INDEX IF NOT EXISTS idx_audits_line_ts ON audits(line, timestamp DESC)",
                "CREATE INDEX IF NOT EXISTS idx_audits_auditor ON audits(auditor_id)",
                "CREATE INDEX IF NOT EXISTS idx_sec_logs_ts_event ON security_audit_logs(timestamp DESC, event_type)",
                "CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(is_active, role)"
            ]
        ),
        (
            3,
            "guidelines_indexes_v1",
            "Indeks dla bazy wiedzy i wytycznych IFS Food v8",
            [
                "CREATE INDEX IF NOT EXISTS idx_guidelines_category ON checklist_guidelines(category, id)"
            ]
        ),
        (
            4,
            "auditor_quick_notes_v1",
            "Tabela szybkich notatek audytora do Key Usera",
            [
                """
                CREATE TABLE IF NOT EXISTS auditor_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    auditor_id INTEGER,
                    auditor_name TEXT NOT NULL,
                    line_id TEXT,
                    line_name TEXT,
                    priority TEXT DEFAULT 'INFO',
                    content TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    read_at TEXT,
                    manager_response TEXT
                )
                """,
                "CREATE INDEX IF NOT EXISTS idx_notes_ts ON auditor_notes(timestamp DESC)",
                "CREATE INDEX IF NOT EXISTS idx_notes_read ON auditor_notes(is_read)"
            ]
        )
    ]

    # Wykonanie brakujących migracji
    for ver, name, desc, statements in migrations:
        if ver not in applied_versions:
            print(f"[DB MIGRATION] Aplikowanie migracji v{ver} ({name})...")
            # Bezpieczny backup pliku przed migracją DDL
            if os.path.exists(DB_NAME):
                backup_name = f"{DB_NAME}.bak_v{ver}"
                if not os.path.exists(backup_name):
                    try:
                        shutil.copy2(DB_NAME, backup_name)
                    except Exception as e_bak:
                        print(f"[DB MIGRATION WARNING] Nie udało się utworzyć kopii zapasowej: {e_bak}")

            for stmt in statements:
                await c.execute(stmt)
            await c.execute(
                "INSERT INTO schema_migrations (version, name, description) VALUES (?, ?, ?)",
                (ver, name, desc)
            )
            await conn.commit()
            print(f"[DB MIGRATION] Migracja v{ver} ({name}) zakończona sukcesem!")

async def init_db():
    async with get_db() as conn:
        c = await conn.cursor()
        
        # Sprawdzamy czy tabela users istnieje i czy są w niej rekordy
        try:
            await c.execute("SELECT COUNT(*) FROM users")
            has_users = (await c.fetchone())[0] > 0
        except Exception:
            has_users = False

        # Jeśli baza jest pusta lub świeża na serwerze, odtwórz ją 1:1 ze zrzutu
        if not has_users and os.path.exists("dump_data.sql"):
            with open("dump_data.sql", "r", encoding="utf-8") as f:
                sql_dump = f.read()
            await conn.executescript(sql_dump)
            await conn.commit()
            print("Baza danych została w 100% odtworzona z dump_data.sql!")

        # Uruchom silnik wersjonowanych migracji
        await run_migrations_engine(conn)

        # Automatyczna migracja niesolonych PIN-ów do formatu PBKDF2 (ISO 27001 A.8.24)
        try:
            from security import hash_pin
            await c.execute("SELECT id, pin FROM users WHERE is_active = 1")
            users = await c.fetchall()
            migrated_count = 0
            for u in users:
                user_id = u["id"]
                raw_pin = u["pin"]
                if raw_pin and not str(raw_pin).startswith("$pbkdf2-sha256$"):
                    hashed = hash_pin(str(raw_pin))
                    await c.execute("UPDATE users SET pin = ? WHERE id = ?", (hashed, user_id))
                    migrated_count += 1
            if migrated_count > 0:
                await conn.commit()
                print(f"[ISO 27001 MIGRACJA] Pomyślnie zahaszowano kody PIN dla {migrated_count} użytkowników (PBKDF2-HMAC-SHA256).")
        except Exception as e_mig:
            print(f"[MIGRATION WARNING] Błąd migracji haseł użytkowników: {e_mig}")

run_migrations = init_db
