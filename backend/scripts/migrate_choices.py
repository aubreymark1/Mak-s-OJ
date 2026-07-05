import asyncio
import os
import sys
from sqlalchemy import text

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine

async def migrate():
    print("Running database migrations for choice questions...")
    async with engine.begin() as conn:
        # Add type column if not exists
        await conn.execute(text("ALTER TABLE problems ADD COLUMN IF NOT EXISTS type VARCHAR(32) DEFAULT 'programming' NOT NULL;"))
        # Add choice_questions column if not exists
        await conn.execute(text("ALTER TABLE problems ADD COLUMN IF NOT EXISTS choice_questions JSONB DEFAULT '[]'::jsonb;"))
        print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(migrate())
