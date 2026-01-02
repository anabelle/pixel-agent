-- Migration: Create diary_entries table
-- Description: Create table for storing diary entries with tags

CREATE TABLE IF NOT EXISTS diary_entries (
    id UUID PRIMARY KEY,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on author for faster queries
CREATE INDEX IF NOT EXISTS idx_diary_author ON diary_entries(author);

-- Create index on created_at for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_diary_created_at ON diary_entries(created_at DESC);

-- Create index on tags array for tag-based queries
CREATE INDEX IF NOT EXISTS idx_diary_tags ON diary_entries USING GIN(tags);

-- Create composite index for author + created_at queries
CREATE INDEX IF NOT EXISTS idx_diary_author_created ON diary_entries(author, created_at DESC);

-- Migration completed
