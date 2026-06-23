import asyncio
from database import engine, Base
import models  # noqa: ensure Exam model is registered

async def run():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables synced successfully")
    await engine.dispose()

asyncio.run(run())
