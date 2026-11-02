import { logger } from '../../utils/logger';
import type { HealthRepository } from './repository';

export function createHealthService(repository: HealthRepository) {
  return {
    /** 数据库可用返回 true；不可用时记录原因并返回 false，由路由回 503 */
    async databaseReady(): Promise<boolean> {
      try {
        await repository.ping();
        return true;
      } catch (error) {
        logger.error('health check failed', { error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
