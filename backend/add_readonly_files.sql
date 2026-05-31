ALTER TABLE problems ADD COLUMN IF NOT EXISTS readonly_files jsonb NOT NULL DEFAULT '[]'::jsonb;
