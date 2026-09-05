import os
import aiosqlite
from contextlib import asynccontextmanager

# Ustawienie ścieżki do bazy danych
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "audits.db")

@asynccontextmanager
async def get_db():
    # Otwórz połączenie z bazą danych z włączonym dostępem po nazwach kolumn
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db

async def run_migrations():
    async with get_db() as db:
        # 1. Tabela Użytkowników
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('MANAGER', 'AUDITOR')),
                is_active INTEGER NOT NULL DEFAULT 1,
                qualifications TEXT NOT NULL DEFAULT '["HACCP","GMP","GHP"]',
                biometric_cred_id TEXT
            );
        """)

        # 2. Tabela Linii Produkcyjnych
        await db.execute("""
            CREATE TABLE IF NOT EXISTS production_lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                code TEXT UNIQUE NOT NULL,
                default_zone TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            );
        """)

        # 3. Tabela Harmonogramu Audytów
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scheduled_date TEXT NOT NULL,
                line TEXT NOT NULL,
                audit_type TEXT NOT NULL CHECK(audit_type IN ('HACCP', 'GMP', 'GHP')),
                lead_auditor TEXT NOT NULL,
                backup_auditor TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PLANOWANY' CHECK(status IN ('PLANOWANY', 'WYKONANY', 'ANULOWANY')),
                notes TEXT,
                completed_at TEXT
            );
        """)

        # 4. Tabela Audytów Operacyjnych
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auditor_pin TEXT NOT NULL,
                auditor_name TEXT NOT NULL,
                line TEXT NOT NULL,
                shift TEXT NOT NULL,
                zone TEXT NOT NULL,
                audit_type TEXT NOT NULL DEFAULT 'HACCP',
                health_ok TEXT NOT NULL DEFAULT 'TAK',
                dispense_no TEXT DEFAULT 'BRAK',
                ppe_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                allergen_clean_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                wood_policy_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                line_status TEXT NOT NULL DEFAULT 'Produkcja Ciągła',
                ccp1_fe_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                ccp1_nonfe_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                ccp1_ss_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                ccp1_reject_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                ccp1_bin_locked TEXT NOT NULL DEFAULT 'ZGODNY',
                ccp2_magnet_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                ccp3_sieve_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                cleanliness_rating INTEGER NOT NULL DEFAULT 5,
                wood_plastic_status TEXT NOT NULL DEFAULT 'ZGODNY',
                waste_disposal_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                estop_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                atex_zone_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                cip_lockout_ok TEXT NOT NULL DEFAULT 'ZGODNY',
                notes TEXT,
                photo_path TEXT,
                ko_failed INTEGER NOT NULL DEFAULT 0,
                risk_level TEXT NOT NULL DEFAULT 'NISKIE',
                slm_verdict TEXT NOT NULL DEFAULT 'OK',
                slm_analysis TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 5. Tabela Wniosków o korektę
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_edit_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audit_id INTEGER NOT NULL,
                requested_by TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'OCZEKUJE' CHECK(status IN ('OCZEKUJE', 'ZATWIERDZONY', 'ODRZUCONY')),
                manager_comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                FOREIGN KEY(audit_id) REFERENCES audits(id)
            );
        """)

        # 6. Tabela Dziennika zmian
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_change_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                audit_id INTEGER NOT NULL,
                modified_by TEXT NOT NULL,
                field_name TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT,
                change_reason TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(audit_id) REFERENCES audits(id)
            );
        """)

        # 7. Tabela Poświadczeń biometrycznych
        await db.execute("""
            CREATE TABLE IF NOT EXISTS biometric_credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                credential_id TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL,
                device_name TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
        """)

        await db.commit()
