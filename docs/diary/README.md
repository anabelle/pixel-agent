# Pixel Diary Integration

This module provides a diary feature for Pixel, allowing Syntropy and other components to read and write diary entries.

## Overview

The diary integration consists of:
- **PostgreSQL Table**: `diary_entries` with full-text search and tagging support
- **Service Layer**: TypeScript service for CRUD operations
- **REST API**: Express routes for external access
- **CLI Commands**: Helper scripts for manual operations

## Database Schema

```sql
CREATE TABLE diary_entries (
    id UUID PRIMARY KEY,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexes:
- `idx_diary_author` - for author-based queries
- `idx_diary_created_at` - for sorting and filtering
- `idx_diary_tags` - GIN index for tag-based queries
- `idx_diary_author_created` - composite index for common queries

## Installation

### 1. Run Migration

```bash
docker exec pixel-postgres-1 psql -U postgres -d pixel_agent -f /app/src/diary/migrations/001_create_diary_entries.sql
```

### 2. Seed Test Data (Optional)

```bash
docker exec pixel-postgres-1 psql -U postgres -d pixel_agent -f /app/src/diary/migrations/seed.sql
```

### 3. Set API Key

Add to your `.env` file:

```
DIARY_API_KEY=your-secret-api-key-here
```

### 4. Restart Agent

```bash
docker compose restart agent
```

## REST API

All write operations require the `X-API-Key` header.

### List Entries

```bash
curl http://localhost:3003/api/diary
```

With filters:

```bash
curl "http://localhost:3003/api/diary?author=Pixel&limit=10&since=2025-01-01"
```

### Create Entry

```bash
curl -X POST http://localhost:3003/api/diary \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "author": "Pixel",
    "content": "Today was a good day",
    "tags": ["mood", "good"]
  }'
```

### Get Entry by ID

```bash
curl http://localhost:3003/api/diary/00000000-0000-0000-0000-000000000001
```

### Update Entry

```bash
curl -X PUT http://localhost:3003/api/diary/00000000-0000-0000-0000-000000000001 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "content": "Updated content",
    "tags": ["updated", "tag"]
  }'
```

### Delete Entry

```bash
curl -X DELETE http://localhost:3003/api/diary/00000000-0000-0000-0000-000000000001 \
  -H "X-API-Key: your-secret-api-key"
```

## Syntropy Integration

Syntropy can interact with the diary via:

### Shell Commands

```bash
# Create entry via database
docker exec pixel-postgres-1 psql -U postgres -d pixel_agent -c \
  "INSERT INTO diary_entries (id, author, content, tags, created_at, updated_at)
   VALUES (gen_random_uuid(), 'Syntropy', 'Entry content', ARRAY['tag'], NOW(), NOW());"

# List entries
docker exec pixel-postgres-1 psql -U postgres -d pixel_agent -c \
  "SELECT * FROM diary_entries ORDER BY created_at DESC LIMIT 10;"

# Get entry by ID
docker exec pixel-postgres-1 psql -U postgres -d pixel_agent -c \
  "SELECT * FROM diary_entries WHERE id = '...' LIMIT 1;"
```

### HTTP API (Recommended)

```bash
# Create entry
curl -X POST http://agent:3003/api/diary \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DIARY_API_KEY" \
  -d '{"author": "Syntropy", "content": "...", "tags": ["tag"]}'

# List entries
curl http://agent:3003/api/diary?limit=10
```

## Testing

### Run Unit Tests

```bash
cd /pixel/pixel-agent
bun test src/diary/__tests__/diary-service.test.ts
```

### Test API Endpoints

```bash
# List all entries
curl http://localhost:3003/api/diary

# Create a test entry
curl -X POST http://localhost:3003/api/diary \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d '{"author": "Test", "content": "Test entry"}'
```

## Rollback

To remove the diary feature:

```bash
docker exec pixel-postgres-1 psql -U postgres -d pixel_agent -f /app/src/diary/migrations/001_rollback.sql
```

## Notes

- All dates are stored in UTC (`TIMESTAMPTZ`)
- Tags are stored as PostgreSQL text arrays for efficient querying
- The `author` field identifies the source of the diary entry
- Write operations require API key authentication via `X-API-Key` header
