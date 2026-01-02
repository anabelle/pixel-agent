import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import pg from 'pg';
import { PostgresDiaryService } from '../diary-service';
import type { DiaryEntry } from '../types';

const testDbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_TEST_DB || 'pixel_agent_test',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
};

let pool: any;
let diaryService: PostgresDiaryService;

describe('DiaryService', () => {
  beforeAll(async () => {
    pool = new pg.Pool(testDbConfig);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id UUID PRIMARY KEY,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    diaryService = new PostgresDiaryService(pool);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS diary_entries');
    await pool.end();
  });

  describe('createEntry', () => {
    it('should create a new diary entry', async () => {
      const entry = await diaryService.createEntry({
        author: 'TestUser',
        content: 'This is a test entry',
        tags: ['test', 'diary'],
      });

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.author).toBe('TestUser');
      expect(entry.content).toBe('This is a test entry');
      expect(entry.tags).toEqual(['test', 'diary']);
      expect(entry.created_at).toBeInstanceOf(Date);
      expect(entry.updated_at).toBeInstanceOf(Date);
    });

    it('should create entry without tags', async () => {
      const entry = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Entry without tags',
      });

      expect(entry.tags).toEqual([]);
    });

    it('should create entry with custom date', async () => {
      const customDate = new Date('2025-01-01T00:00:00Z');
      const entry = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Entry with date',
        date: customDate,
      });

      expect(entry.created_at).toBeDefined();
    });
  });

  describe('listEntries', () => {
    beforeEach(async () => {
      await pool.query('DELETE FROM diary_entries');

      await diaryService.createEntry({
        author: 'User1',
        content: 'Entry 1',
        tags: ['a'],
      });
      await diaryService.createEntry({
        author: 'User1',
        content: 'Entry 2',
        tags: ['b'],
      });
      await diaryService.createEntry({
        author: 'User2',
        content: 'Entry 3',
        tags: ['c'],
      });
    });

    it('should list all entries ordered by created_at DESC', async () => {
      const entries = await diaryService.listEntries({});

      expect(entries.length).toBe(3);
      expect(entries[0].content).toBe('Entry 3');
    });

    it('should filter entries by author', async () => {
      const entries = await diaryService.listEntries({ author: 'User1' });

      expect(entries.length).toBe(2);
      expect(entries.every((e: DiaryEntry) => e.author === 'User1')).toBe(true);
    });

    it('should filter entries by limit', async () => {
      const entries = await diaryService.listEntries({ limit: 2 });

      expect(entries.length).toBe(2);
    });

    it('should filter entries by since date', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const entries = await diaryService.listEntries({ since: yesterday });

      expect(entries.length).toBeGreaterThan(0);
    });

    it('should combine filters', async () => {
      const entries = await diaryService.listEntries({
        author: 'User1',
        limit: 1,
      });

      expect(entries.length).toBe(1);
      expect(entries[0].author).toBe('User1');
    });
  });

  describe('getEntry', () => {
    it('should get entry by id', async () => {
      const created = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Test content',
      });

      const entry = await diaryService.getEntry(created.id);

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(created.id);
    });

    it('should return null for non-existent entry', async () => {
      const entry = await diaryService.getEntry(
        '00000000-0000-0000-0000-000000000999'
      );

      expect(entry).toBeNull();
    });
  });

  describe('updateEntry', () => {
    it('should update entry content', async () => {
      const created = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Original content',
      });

      const updated = await diaryService.updateEntry(created.id, {
        content: 'Updated content',
      });

      expect(updated).toBeDefined();
      expect(updated?.content).toBe('Updated content');
      expect(updated?.updated_at.getTime()).toBeGreaterThan(
        created.updated_at.getTime()
      );
    });

    it('should update entry tags', async () => {
      const created = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Test content',
        tags: ['old', 'tags'],
      });

      const updated = await diaryService.updateEntry(created.id, {
        tags: ['new', 'tags'],
      });

      expect(updated?.tags).toEqual(['new', 'tags']);
    });

    it('should update both content and tags', async () => {
      const created = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Original',
        tags: ['a'],
      });

      const updated = await diaryService.updateEntry(created.id, {
        content: 'Updated',
        tags: ['b'],
      });

      expect(updated?.content).toBe('Updated');
      expect(updated?.tags).toEqual(['b']);
    });

    it('should return null for non-existent entry', async () => {
      const updated = await diaryService.updateEntry(
        '00000000-0000-0000-0000-000000000999',
        {
          content: 'New content',
        }
      );

      expect(updated).toBeNull();
    });

    it('should return entry when no changes provided', async () => {
      const created = await diaryService.createEntry({
        author: 'TestUser',
        content: 'Test content',
      });

      const updated = await diaryService.updateEntry(created.id, {});

      expect(updated).toBeDefined();
      expect(updated?.id).toBe(created.id);
    });
  });

  describe('deleteEntry', () => {
    it('should delete entry', async () => {
      const created = await diaryService.createEntry({
        author: 'TestUser',
        content: 'To be deleted',
      });

      const deleted = await diaryService.deleteEntry(created.id);

      expect(deleted).toBe(true);

      const entry = await diaryService.getEntry(created.id);
      expect(entry).toBeNull();
    });

    it('should return false for non-existent entry', async () => {
      const deleted = await diaryService.deleteEntry(
        '00000000-0000-0000-0000-000000000999'
      );

      expect(deleted).toBe(false);
    });
  });
});
