import aiosqlite
import json
from contextlib import asynccontextmanager

DB_NAME = "audits.db"
DB_PATH = DB_NAME

@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(DB_NAME) as conn:
        conn.row_factory = aiosqlite.Row
        yield conn

async def init_db():
    async with get_db() as conn:
        c = await conn.cursor()
        
        # 1. Users
        await c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                qualifications TEXT DEFAULT '["HACCP", "GMP", "GHP"]',
                notes TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1,
                biometric_cred_id TEXT
            )
        """)

        for col, definition in [
            ("full_name", "TEXT DEFAULT ''"),
            ("is_active", "INTEGER DEFAULT 1"),
            ("qualifications", "TEXT DEFAULT '[\"HACCP\", \"GMP\", \"GHP\"]'"),
            ("notes", "TEXT DEFAULT ''"),
            ("biometric_cred_id", "TEXT")
        ]:
            try:
                await c.execute(f"ALTER TABLE users ADD COLUMN {col} {definition}")
            except Exception:
                pass

        # 2. Production lines (z kolumnami code, default_zone, is_active)
        await c.execute("""
            CREATE TABLE IF NOT EXISTS production_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                code TEXT DEFAULT '',
                default_zone TEXT DEFAULT '',
                zone TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1
            )
        """)

        for col, definition in [
            ("code", "TEXT DEFAULT ''"),
            ("default_zone", "TEXT DEFAULT ''"),
            ("zone", "TEXT DEFAULT ''"),
            ("is_active", "INTEGER DEFAULT 1")
        ]:
            try:
                await c.execute(f"ALTER TABLE production_lines ADD COLUMN {col} {definition}")
            except Exception:
                pass

        # 3. Audit schedules
        await c.execute("""
            CREATE TABLE IF NOT EXISTS audit_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scheduled_date TEXT NOT NULL,
                audit_type TEXT NOT NULL,
                line TEXT NOT NULL,
                lead_auditor TEXT NOT NULL,
                backup_auditor TEXT,
                status TEXT DEFAULT 'PLANOWANY',
                notes TEXT
            )
        """)

        # 4. Audits
        await c.execute("""
            CREATE TABLE IF NOT EXISTS audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auditor_pin TEXT,
                auditor_name TEXT,
                line TEXT NOT NULL,
                shift TEXT NOT NULL,
                slm_verdict TEXT,
                risk_level TEXT,
                process_status TEXT DEFAULT 'ZATWIERDZONY',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data JSON
            )
        """)

        # 5. Checklist guidelines
        await c.execute("""
            CREATE TABLE IF NOT EXISTS checklist_guidelines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                standard TEXT NOT NULL,
                clause TEXT NOT NULL,
                title TEXT NOT NULL,
                requirement TEXT NOT NULL,
                guideline TEXT NOT NULL,
                risk_category TEXT NOT NULL
            )
        """)

        # 6. Audit edit requests & change logs
        await c.execute("""
            CREATE TABLE IF NOT EXISTS audit_edit_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audit_id INTEGER NOT NULL,
                requested_by TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await c.execute("""
            CREATE TABLE IF NOT EXISTS audit_change_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audit_id INTEGER NOT NULL,
                changed_by TEXT NOT NULL,
                changes TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await c.execute("""
            CREATE TABLE IF NOT EXISTS biometric_credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_pin TEXT NOT NULL,
                credential_id TEXT NOT NULL,
                public_key TEXT NOT NULL,
                sign_count INTEGER DEFAULT 0
            )
        """)

        # --- SEED: KIEROWNIK I AUDYTORZY ---
        default_users = [
            ('9999', 'Manager Jakości', 'MANAGER', '["IFS", "BRCGS", "HACCP"]', 'Kierownik Jakości', 1),
            ('1001', 'Jan Kowalski', 'AUDITOR', '["HACCP", "GMP"]', 'Audytor Wewnętrzny', 1),
            ('1002', 'Anna Nowak', 'AUDITOR', '["HACCP", "GHP"]', 'Audytor Wewnętrzny', 1),
            ('1003', 'Piotr Wiśniewski', 'AUDITOR', '["HACCP", "GMP", "GHP", "IFS"]', 'Audytor Wiodący', 1)
        ]
        for u in default_users:
            await c.execute("""
                INSERT OR REPLACE INTO users (pin, full_name, role, qualifications, notes, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
            """, u)

        # --- SEED: LINIE PRODUKCYJNE ---
        default_lines = [
            ('Linia Czekolady 1', 'L-01', 'Strefa Produkcji Czystej', 'Strefa Produkcji Czystej', 1),
            ('Linia Pakowania Slices', 'L-02', 'Strefa Pakowania', 'Strefa Pakowania', 1),
            ('Formowanie Tabliczek', 'L-03', 'Strefa Produkcji Czystej', 'Strefa Produkcji Czystej', 1)
        ]
        for l in default_lines:
            await c.execute("""
                INSERT OR REPLACE INTO production_lines (name, code, default_zone, zone, is_active)
                VALUES (?, ?, ?, ?, ?)
            """, l)

        # --- SEED: WYTYCZNE IFS/BRCGS ---
        await c.execute("SELECT COUNT(*) FROM checklist_guidelines")
        if (await c.fetchone())[0] == 0:
            default_guidelines = [
                ('IFS Food v8', '4.1.1', 'Czystość i higiena linii produkcyjnej', 'Wszystkie powierzchnie kontaktujące się z żywnością muszą być czyste i zdezynfekowane.', 'Skontroluj taśmociągi, leje zasypowe oraz głowice dozujące pod kątem pozostałości masy czekoladowej.', 'HIGH'),
                ('IFS Food v8', '4.4.2', 'Kontrola ciał obcych (detektor metali)', 'System detekcji metali musi być sprawny i testowany w regularnych odstępach czasu.', 'Zweryfikuj poprawność odrzutu wzorców Fe, Non-Fe oraz SS zgodnie z instrukcją stanowiskową.', 'CRITICAL'),
                ('BRCGS Issue 9', '4.10.1', 'Zarządzanie alergenami na liniach pakowania', 'Procedury czyszczenia muszą zapobiegać zanieczyszczeniu krzyżowemu alergenami.', 'Upewnij się, że po partii z orzechami przeprowadzono walidowane mycie i test wymazowy.', 'HIGH')
            ]
            await c.executemany("INSERT INTO checklist_guidelines (standard, clause, title, requirement, guideline, risk_category) VALUES (?, ?, ?, ?, ?, ?)", default_guidelines)

        await conn.commit()

run_migrations = init_db
