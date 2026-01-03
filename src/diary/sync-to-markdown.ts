/**
 * Diary Sync to Markdown
 * 
 * Syncs diary entries to markdown files in docs/v1/diary/ for vectorization
 * by the @elizaos/plugin-knowledge plugin.
 * 
 * This module provides atomic write operations to ensure new diary entries
 * become part of the knowledge base on agent restart.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Resolve paths relative to pixel-agent root
const PIXEL_AGENT_ROOT = path.resolve(__dirname, '../..');
const DIARY_MD_DIR = path.resolve(PIXEL_AGENT_ROOT, 'docs/v1/diary');

// Helper to ensure directory exists
async function ensureDir(dirPath: string): Promise<void> {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
    }
}

// Helper to check if path exists
async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

interface DiaryEntryForSync {
    id: string;
    author: string;
    content: string;
    tags: string[];
    created_at: Date;
}

/**
 * Get the markdown filename for a given date
 * Format: "2026-Jan-02.md" for clarity across years
 */
function getMarkdownFilename(date: Date): string {
    const year = date.getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}.md`;
}

/**
 * Format a diary entry as markdown content
 */
function formatEntryAsMarkdown(entry: DiaryEntryForSync): string {
    const date = new Date(entry.created_at);
    const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    const tagsStr = entry.tags.length > 0
        ? `\n**Tags:** ${entry.tags.join(', ')}`
        : '';

    return `
---

### ${timeStr} - ${entry.author}${tagsStr}

${entry.content}

*Entry ID: ${entry.id}*
`;
}

/**
 * Get the header for a diary markdown file
 */
function getFileHeader(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    const dateStr = date.toLocaleDateString('en-US', options);

    return `# Pixel's Diary: ${dateStr}

*Auto-synced diary entries from the database. These entries are vectorized for knowledge context.*

`;
}

/**
 * Sync a diary entry to markdown file atomically.
 * Appends to existing file or creates new one.
 * 
 * @param entry The diary entry to sync
 * @returns Object with success status and file path
 */
export async function syncEntryToMarkdown(entry: DiaryEntryForSync): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
}> {
    try {
        // Ensure directory exists
        await ensureDir(DIARY_MD_DIR);

        const entryDate = new Date(entry.created_at);
        const filename = getMarkdownFilename(entryDate);
        const filePath = path.join(DIARY_MD_DIR, filename);

        const entryMarkdown = formatEntryAsMarkdown(entry);

        // Check if file exists
        if (await pathExists(filePath)) {
            // Append to existing file
            await fs.appendFile(filePath, entryMarkdown);
        } else {
            // Create new file with header
            const header = getFileHeader(entryDate);
            await fs.writeFile(filePath, header + entryMarkdown);
        }

        console.log(`[DIARY-SYNC] ✅ Entry synced to ${filename}`);

        return {
            success: true,
            filePath: filePath.replace(PIXEL_AGENT_ROOT, '')
        };
    } catch (error: any) {
        console.error(`[DIARY-SYNC] ❌ Failed to sync entry: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Bulk sync entries from the database to markdown.
 * Useful for initial migration or recovery.
 * 
 * @param entries Array of diary entries to sync
 * @returns Summary of sync operation
 */
export async function bulkSyncToMarkdown(entries: DiaryEntryForSync[]): Promise<{
    total: number;
    synced: number;
    failed: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let synced = 0;
    let failed = 0;

    for (const entry of entries) {
        const result = await syncEntryToMarkdown(entry);
        if (result.success) {
            synced++;
        } else {
            failed++;
            errors.push(`${entry.id}: ${result.error}`);
        }
    }

    return {
        total: entries.length,
        synced,
        failed,
        errors
    };
}

/**
 * Get the path to the diary markdown directory
 */
export function getDiaryMarkdownDir(): string {
    return DIARY_MD_DIR;
}
