from __future__ import annotations

from fastapi import FastAPI
from sqlalchemy import text

from app.routers import admin_problems_router, admin_users_router, auth_router, problem_router
from database import AsyncSessionLocal
from routers import submit_router, user_router

app = FastAPI(title="Matrix OJ Clone Backend", version="0.6.0")
app.include_router(submit_router)
app.include_router(user_router)
app.include_router(auth_router)
app.include_router(problem_router)
app.include_router(admin_problems_router)
app.include_router(admin_users_router)


@app.get("/healthz", tags=["system"])
async def healthcheck() -> dict[str, str]:
    async with AsyncSessionLocal() as session:
        await session.execute(text("SELECT 1"))

    return {
        "status": "ok",
        "database": "reachable",
        "redis": "configured",
    }
