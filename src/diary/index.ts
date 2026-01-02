import { Plugin, IAgentRuntime, Service, logger } from '@elizaos/core';
import { PostgresDiaryService } from './diary-service';
import type { DiaryServiceInterface } from './types';

export class DiaryServiceClass extends Service {
  static serviceType = 'diary';
  capabilityDescription = 'Diary service for Pixel agent';

  private service: DiaryServiceInterface | null = null;

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<DiaryServiceClass> {
    logger.info('[DIARY] Starting diary service');

    const service = new DiaryServiceClass(runtime);

    try {
      const dbUrl = (runtime.getSetting('POSTGRES_URL') as string) || (runtime.getSetting('DATABASE_URL') as string);
      if (!dbUrl) {
        throw new Error('PostgreSQL connection URL not found');
      }

      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: dbUrl });

      service.service = new PostgresDiaryService(pool);
      logger.info('[DIARY] Diary service initialized successfully');
     } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[DIARY] Failed to initialize diary service:', errorMessage);
      throw new Error(errorMessage);
    }

    return service;
  }

  getService(): DiaryServiceInterface | null {
    return this.service;
  }

  async stop(): Promise<void> {
    logger.info('[DIARY] Diary service stopped');
    this.service = null;
  }
}

export const diaryPlugin: Plugin = {
  name: 'diary',
  description: 'Diary plugin for Pixel agent - CRUD operations for diary entries',
  services: [DiaryServiceClass],
  actions: [],
  evaluators: []
};

export default diaryPlugin;
