"""
Backend configuration — all values loaded from environment variables with safe defaults.

For local development, create a .env file in this directory (see .env.example).
In production, set these via your container orchestrator or deployment platform.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# ── PostgreSQL ────────────────────────────────────────────────────────────────
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "db")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "oj_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "oj_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "CHANGE_ME")

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_URL = os.getenv("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/0")

# ── Judge Core ───────────────────────────────────────────────────────────────
JUDGE_CORE_URL = os.getenv("JUDGE_CORE_URL", "http://judge-core:5050")
JUDGE_REQUEST_TIMEOUT_SECONDS = float(os.getenv("JUDGE_REQUEST_TIMEOUT_SECONDS", "20"))
JUDGE_GLOBAL_TIMEOUT_SECONDS = int(os.getenv("JUDGE_GLOBAL_TIMEOUT_SECONDS", "60"))
DEFAULT_TIME_LIMIT_MS = int(os.getenv("DEFAULT_TIME_LIMIT_MS", "2000"))
DEFAULT_MEMORY_LIMIT_KB = int(os.getenv("DEFAULT_MEMORY_LIMIT_KB", "262144"))

# ── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE_ME")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))


def build_async_database_url() -> str:
    if explicit := os.getenv("DATABASE_URL"):
        return explicit

    user = quote_plus(POSTGRES_USER)
    password = quote_plus(POSTGRES_PASSWORD)
    database = quote_plus(POSTGRES_DB)
    return (
        f"postgresql+asyncpg://{user}:{password}@{POSTGRES_HOST}:{POSTGRES_PORT}/{database}"
    )


DATABASE_URL = build_async_database_url()
