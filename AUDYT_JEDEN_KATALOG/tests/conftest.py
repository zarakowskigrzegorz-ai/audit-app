import os
import sys
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import main
from database import run_migrations

@pytest.fixture(scope="session", autouse=True)
def setup_test_env():
    os.environ["TESTING"] = "1"
    import asyncio
    asyncio.run(run_migrations())

@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c
