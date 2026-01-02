#!/usr/bin/env bun

import { Client } from 'pg';
import { randomUUID } from 'crypto';

const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/pixel_agent';

interface DiaryEntry {
  id: string;
  author: string;
  content: string;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

class DiaryCLI {
  private client: Client;

  constructor() {
    this.client = new Client({ connectionString: POSTGRES_URL });
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.end();
  }

  async listEntries(options: { limit?: number; author?: string } = {}): Promise<void> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (options.author) {
      conditions.push(`author = $${paramIndex}`);
      values.push(options.author);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';

    const query = `
      SELECT * FROM diary_entries
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause}
    `;

    const result = await this.client.query(query, values);

    console.log(`Found ${result.rows.length} entries:\n`);

    for (const row of result.rows) {
      console.log(`ID: ${row.id}`);
      console.log(`Author: ${row.author}`);
      console.log(`Tags: ${row.tags.join(', ') || 'none'}`);
      console.log(`Created: ${row.created_at}`);
      console.log(`Content: ${row.content}`);
      console.log('---');
    }
  }

  async readEntry(id: string): Promise<void> {
    const result = await this.client.query(
      'SELECT * FROM diary_entries WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`Entry not found: ${id}`);
      return;
    }

    const entry = result.rows[0];
    console.log(`ID: ${entry.id}`);
    console.log(`Author: ${entry.author}`);
    console.log(`Tags: ${entry.tags.join(', ') || 'none'}`);
    console.log(`Created: ${entry.created_at}`);
    console.log(`Updated: ${entry.updated_at}`);
    console.log(`Content:\n${entry.content}`);
  }

  async writeEntry(author: string, content: string, tags: string[] = []): Promise<void> {
    const id = randomUUID();
    const now = new Date();

    await this.client.query(
      `INSERT INTO diary_entries (id, author, content, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, author, content, tags, now, now]
    );

    console.log(`Entry created: ${id}`);
    console.log(`Author: ${author}`);
    console.log(`Tags: ${tags.join(', ') || 'none'}`);
    console.log(`Content: ${content}`);
  }

  async updateEntry(id: string, content?: string, tags?: string[]): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      values.push(content);
      paramIndex++;
    }

    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      values.push(tags);
      paramIndex++;
    }

    if (updates.length === 0) {
      console.log('No changes specified');
      return;
    }

    updates.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    paramIndex++;

    const query = `
      UPDATE diary_entries
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.client.query(query, values);

    if (result.rows.length === 0) {
      console.log(`Entry not found: ${id}`);
      return;
    }

    console.log(`Entry updated: ${id}`);
    console.log(`Updated at: ${result.rows[0].updated_at}`);
  }

  async deleteEntry(id: string): Promise<void> {
    const result = await this.client.query(
      'DELETE FROM diary_entries WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`Entry not found: ${id}`);
      return;
    }

    console.log(`Entry deleted: ${id}`);
  }

  async show(id: string): Promise<void> {
    await this.readEntry(id);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const cli = new DiaryCLI();

  try {
    await cli.connect();

    switch (command) {
      case 'list':
        await cli.listEntries({
          limit: args[1] ? parseInt(args[1]) : undefined,
          author: args[2],
        });
        break;

      case 'read':
      case 'show': {
        if (!args[1]) {
          console.error('Usage: diary read <id>');
          process.exit(1);
        }
        await cli.readEntry(args[1]);
        break;
      }

      case 'write': {
        const author = args[1];
        const content = args[2];
        const tags = args[3] ? args[3].split(',') : [];

        if (!author || !content) {
          console.error('Usage: diary write <author> <content> [tags]');
          process.exit(1);
        }

        await cli.writeEntry(author, content, tags);
        break;
      }

      case 'update': {
        const id = args[1];
        const content = args[2];
        const tags = args[3] ? args[3].split(',') : undefined;

        if (!id) {
          console.error('Usage: diary update <id> [content] [tags]');
          process.exit(1);
        }

        await cli.updateEntry(id, content, tags);
        break;
      }

      case 'delete': {
        if (!args[1]) {
          console.error('Usage: diary delete <id>');
          process.exit(1);
        }

        await cli.deleteEntry(args[1]);
        break;
      }

      default:
        console.log('Usage: diary <command> [arguments]');
        console.log('\nCommands:');
        console.log('  list [limit] [author]   - List diary entries');
        console.log('  read <id>               - Read a diary entry');
        console.log('  show <id>               - Show a diary entry (same as read)');
        console.log('  write <author> <content> [tags] - Write a new diary entry');
        console.log('  update <id> [content] [tags]   - Update a diary entry');
        console.log('  delete <id>             - Delete a diary entry');
        console.log('\nExamples:');
        console.log('  diary list 10 Pixel');
        console.log('  diary write Pixel "Today was good" "mood,good"');
        console.log('  diary read <entry-id>');
        console.log('  diary update <entry-id> "Updated content"');
        console.log('  diary delete <entry-id>');
    }
  } finally {
    await cli.disconnect();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
