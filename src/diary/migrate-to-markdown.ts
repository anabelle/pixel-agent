#!/usr/bin/env bun
/**
 * Migrate Existing Diary Entries to Markdown
 * 
 * One-time script to sync all existing diary_entries from PostgreSQL
 * to markdown files in docs/v1/diary/ for knowledge vectorization.
 * 
 * Usage: bun src/diary/migrate-to-markdown.ts
 */

import { Client } from 'pg';
import { bulkSyncToMarkdown } from './sync-to-markdown';

const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/pixel_agent';

async function main() {
    console.log('[MIGRATION] Starting diary entries migration to markdown...');

    const client = new Client({ connectionString: POSTGRES_URL });

    try {
        await client.connect();
        console.log('[MIGRATION] Connected to PostgreSQL');

        // Fetch all diary entries
        const result = await client.query(`
      SELECT id, author, content, tags, created_at
      FROM diary_entries
      ORDER BY created_at ASC
    `);

        console.log(`[MIGRATION] Found ${result.rows.length} entries to migrate`);

        if (result.rows.length === 0) {
            console.log('[MIGRATION] No entries to migrate');
            return;
        }

        // Map to the expected format
        const entries = result.rows.map(row => ({
            id: row.id,
            author: row.author,
            content: row.content,
            tags: row.tags || [],
            created_at: new Date(row.created_at)
        }));

        // Bulk sync to markdown
        const syncResult = await bulkSyncToMarkdown(entries);

        console.log('[MIGRATION] Migration complete!');
        console.log(`  Total entries: ${syncResult.total}`);
        console.log(`  Successfully synced: ${syncResult.synced}`);
        console.log(`  Failed: ${syncResult.failed}`);

        if (syncResult.errors.length > 0) {
            console.log('[MIGRATION] Errors:');
            syncResult.errors.forEach(e => console.log(`  - ${e}`));
        }

    } catch (error: any) {
        console.error(`[MIGRATION] Error: ${error.message}`);
        process.exit(1);
    } finally {
        await client.end();
        console.log('[MIGRATION] Disconnected from PostgreSQL');
    }
}

main();
