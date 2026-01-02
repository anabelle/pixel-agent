import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type {
  DiaryEntry,
  CreateDiaryEntryInput,
  ListDiaryEntriesOptions,
  UpdateDiaryEntryInput,
  DiaryServiceInterface,
} from './types';

export class PostgresDiaryService implements DiaryServiceInterface {
  constructor(private pool: Pool) {}

  async createEntry(input: CreateDiaryEntryInput): Promise<DiaryEntry> {
    const id = randomUUID();
    const now = new Date();
    const tags = input.tags || [];

    const query = `
      INSERT INTO diary_entries (id, author, content, tags, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [id, input.author, input.content, tags, now, now];
    const result = await this.pool.query(query, values);

    return this.mapRowToEntry(result.rows[0]);
  }

  async listEntries(options: ListDiaryEntriesOptions = {}): Promise<DiaryEntry[]> {
    const conditions: string[] = [];
    const values: (string | Date | string[])[] = [];
    let paramIndex = 1;

    if (options.author) {
      conditions.push(`author = $${paramIndex}`);
      values.push(options.author);
      paramIndex++;
    }

    if (options.since) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(options.since);
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

    const result = await this.pool.query(query, values);

    return result.rows.map(this.mapRowToEntry);
  }

  async getEntry(id: string): Promise<DiaryEntry | null> {
    const query = `
      SELECT * FROM diary_entries
      WHERE id = $1
      LIMIT 1
    `;

    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToEntry(result.rows[0]);
  }

  async updateEntry(
    id: string,
    changes: UpdateDiaryEntryInput
  ): Promise<DiaryEntry | null> {
    const updates: string[] = [];
    const values: (string | Date | string[])[] = [id];
    let paramIndex = 2;

    if (changes.content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      values.push(changes.content);
      paramIndex++;
    }

    if (changes.tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      values.push(changes.tags);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getEntry(id);
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

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToEntry(result.rows[0]);
  }

  async deleteEntry(id: string): Promise<boolean> {
    const query = `
      DELETE FROM diary_entries
      WHERE id = $1
      RETURNING id
    `;

    const result = await this.pool.query(query, [id]);

    return result.rows.length > 0;
  }

  private mapRowToEntry(row: any): DiaryEntry {
    return {
      id: row.id,
      author: row.author,
      content: row.content,
      tags: row.tags || [],
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
