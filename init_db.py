import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "audits.db")


def init_database():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()

    # 1. Tabela Użytkowników (RBAC: PIN 9999 dla Managera, 1001-1003 dla Audytorów)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pin TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('MANAGER', 'AUDITOR')),
            is_active INTEGER NOT NULL DEFAULT 1
        );
    """)

    # 2. Tabela Linii Produkcyjnych (Zarządzanie dynamiczne)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS production_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL,
            default_zone TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );
    """)

    # 3. Tabela Harmonogramu Audytów (Planer Ręczny & Generator AI)
    cursor.execute("""
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

    # 4. Tabela Audytów Operacyjnych (Wszystkie parametry z formularzy + SLM)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auditor_pin TEXT NOT NULL,
            auditor_name TEXT NOT NULL,
            line TEXT NOT NULL,
            shift TEXT NOT NULL,
            zone TEXT NOT NULL,
            audit_type TEXT NOT NULL DEFAULT 'HACCP',
            
            -- Krok 1: Pre-Audit & PR15.01
            health_ok TEXT NOT NULL DEFAULT 'TAK',
            dispense_no TEXT DEFAULT 'BRAK',
            ppe_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            allergen_clean_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            wood_policy_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            line_status TEXT NOT NULL DEFAULT 'Produkcja Ciągła',
            
            -- Krok 2: CCP & oPRP (Punkty Krytyczne)
            ccp1_fe_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            ccp1_nonfe_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            ccp1_ss_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            ccp1_reject_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            ccp1_bin_locked TEXT NOT NULL DEFAULT 'ZGODNY',
            ccp2_magnet_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            ccp3_sieve_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            
            -- Krok 3 & 4: GMP, Ciała Obce, BHP / EHS
            cleanliness_rating INTEGER NOT NULL DEFAULT 5,
            wood_plastic_status TEXT NOT NULL DEFAULT 'ZGODNY',
            waste_disposal_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            estop_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            atex_zone_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            cip_lockout_ok TEXT NOT NULL DEFAULT 'ZGODNY',
            notes TEXT,
            photo_path TEXT,
            
            -- Rygor IFS v8 & Wynik SLM Co-Pilot
            ko_failed INTEGER NOT NULL DEFAULT 0,
            risk_level TEXT NOT NULL DEFAULT 'NISKIE',
            slm_verdict TEXT NOT NULL DEFAULT 'OK',
            slm_analysis TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Migracja brakujących kolumn (w razie istniejącej wcześniej bazy)
    cursor.execute("PRAGMA table_info(audits);")
    existing_cols = [row[1] for row in cursor.fetchall()]
    required_cols = {
        "health_ok": "TEXT NOT NULL DEFAULT 'TAK'",
        "dispense_no": "TEXT DEFAULT 'BRAK'",
        "ppe_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "allergen_clean_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "wood_policy_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "line_status": "TEXT NOT NULL DEFAULT 'Produkcja Ciągła'",
        "ccp1_fe_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "ccp1_nonfe_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "ccp1_ss_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "ccp1_reject_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "ccp1_bin_locked": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "ccp2_magnet_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "ccp3_sieve_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "cleanliness_rating": "INTEGER NOT NULL DEFAULT 5",
        "wood_plastic_status": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "waste_disposal_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "estop_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "atex_zone_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "cip_lockout_ok": "TEXT NOT NULL DEFAULT 'ZGODNY'",
        "notes": "TEXT",
        "photo_path": "TEXT",
        "ko_failed": "INTEGER NOT NULL DEFAULT 0",
        "risk_level": "TEXT NOT NULL DEFAULT 'NISKIE'",
        "slm_verdict": "TEXT NOT NULL DEFAULT 'OK'",
        "slm_analysis": "TEXT"
    }

    for col, definition in required_cols.items():
        if col not in existing_cols:
            cursor.execute(f"ALTER TABLE audits ADD COLUMN {col} {definition};")

    # Seedowanie kont użytkowników
    users_seed = [
        ("9999", "Marta Wiśniewska (Kierownik Jakości)", "MANAGER"),
        ("1001", "Grzegorz Zarakowski (Lead Auditor)", "AUDITOR"),
        ("1002", "Piotr Kowalski (Audytor)", "AUDITOR"),
        ("1003", "Anna Nowak (Audytor)", "AUDITOR")
    ]
    for pin, name, role in users_seed:
        cursor.execute("""
            INSERT OR IGNORE INTO users (pin, full_name, role, is_active)
            VALUES (?, ?, ?, 1)
        """, (pin, name, role))

    # Seedowanie linii produkcyjnych
    lines_seed = [
        ("Linia L1 (Masa Konszowanie)", "L1", "Wysoka Higiena (High Care)"),
        ("Linia L2 (Pakowanie Czekolady)", "L2", "Strefa Pakowania"),
        ("Linia L3 (Formowanie Pralin)", "L3", "Wysoka Higiena (High Care)")
    ]
    for name, code, zone in lines_seed:
        cursor.execute("""
            INSERT OR IGNORE INTO production_lines (name, code, default_zone, is_active)
            VALUES (?, ?, ?, 1)
        """, (name, code, zone))

    conn.commit()
    conn.close()
    print(f"✅ Baza danych SQLite zainicjalizowana pomyślnie w: {DB_PATH}")


if __name__ == "__main__":
    init_database()