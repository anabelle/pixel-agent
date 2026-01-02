export interface DiaryEntry {
  id: string;
  author: string;
  content: string;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

export interface CreateDiaryEntryInput {
  author: string;
  content: string;
  tags?: string[];
  date?: Date;
}

export interface ListDiaryEntriesOptions {
  limit?: number;
  since?: Date;
  author?: string;
}

export interface UpdateDiaryEntryInput {
  content?: string;
  tags?: string[];
}

export interface DiaryServiceInterface {
  createEntry(input: CreateDiaryEntryInput): Promise<DiaryEntry>;
  listEntries(options: ListDiaryEntriesOptions): Promise<DiaryEntry[]>;
  getEntry(id: string): Promise<DiaryEntry | null>;
  updateEntry(id: string, changes: UpdateDiaryEntryInput): Promise<DiaryEntry | null>;
  deleteEntry(id: string): Promise<boolean>;
}

export type DiaryService = DiaryServiceInterface;
