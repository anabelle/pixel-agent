import { Plugin, IAgentRuntime, logger } from '@elizaos/core';
import express, { Request, Response, Router } from 'express';
import type { DiaryServiceInterface } from './types';

export class DiaryAPI {
  private router: Router;
  private apiKey: string;

  constructor(private runtime: IAgentRuntime, private service: DiaryServiceInterface) {
    this.router = express.Router();
    this.apiKey = runtime.getSetting('DIARY_API_KEY') || '';
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/api/diary', this.listEntries.bind(this));
    this.router.post('/api/diary', this.authMiddleware, this.createEntry.bind(this));
    this.router.get('/api/diary/:id', this.getEntry.bind(this));
    this.router.put('/api/diary/:id', this.authMiddleware, this.updateEntry.bind(this));
    this.router.delete('/api/diary/:id', this.authMiddleware, this.deleteEntry.bind(this));
  }

  private authMiddleware(req: Request, res: Response, next: any): void {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey || apiKey !== this.apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  }

  private async listEntries(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const author = req.query.author as string | undefined;

      const entries = await this.service!.listEntries({ limit, since, author });

      res.json({
        success: true,
        data: entries,
        count: entries.length
      });
    } catch (error: any) {
      logger.error('[DIARY API] Error listing entries:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  private async createEntry(req: Request, res: Response): Promise<void> {
    try {
      const { author, content, tags, date } = req.body;

      if (!author || !content) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: author, content'
        });
        return;
      }

      const entry = await this.service!.createEntry({
        author,
        content,
        tags,
        date
      });

      res.status(201).json({
        success: true,
        data: entry
      });
    } catch (error: any) {
      logger.error('[DIARY API] Error creating entry:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  private async getEntry(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const entry = await this.service!.getEntry(id);

      if (!entry) {
        res.status(404).json({
          success: false,
          error: 'Entry not found'
        });
        return;
      }

      res.json({
        success: true,
        data: entry
      });
    } catch (error: any) {
      logger.error('[DIARY API] Error getting entry:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  private async updateEntry(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { content, tags } = req.body;

      if (!content && !tags) {
        res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
        return;
      }

      const entry = await this.service!.updateEntry(id, { content, tags });

      if (!entry) {
        res.status(404).json({
          success: false,
          error: 'Entry not found'
        });
        return;
      }

      res.json({
        success: true,
        data: entry
      });
    } catch (error: any) {
      logger.error('[DIARY API] Error updating entry:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  private async deleteEntry(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await this.service!.deleteEntry(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Entry not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Entry deleted successfully'
      });
    } catch (error: any) {
      logger.error('[DIARY API] Error deleting entry:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

export function setupDiaryAPI(runtime: IAgentRuntime, service: DiaryServiceInterface): DiaryAPI {
  return new DiaryAPI(runtime, service);
}
