-- Rollback: Drop diary_entries table
-- Description: Remove diary entries table and all associated indexes

DROP INDEX IF EXISTS idx_diary_author_created;
DROP INDEX IF EXISTS idx_diary_tags;
DROP INDEX IF EXISTS idx_diary_created_at;
DROP INDEX IF EXISTS idx_diary_author;

DROP TABLE IF EXISTS diary_entries;

-- Rollback completed
