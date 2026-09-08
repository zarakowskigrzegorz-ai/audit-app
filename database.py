import aiosqlite
import os
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
            # aiosqlite executescript obsługuje wielolinijkowe zrzuty bazy
            await conn.executescript(sql_dump)
            await conn.commit()
            print("Baza danych została w 100% odtworzona z dump_data.sql!")

run_migrations = init_db
