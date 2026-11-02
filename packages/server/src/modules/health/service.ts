import { logger } from '../../utils/logger';
import type { HealthRepository } from './repository';

export interface HealthOptions {
  /** 本实例启动时生成的随机 ID，多实例部署时用于分辨是哪个实例在应答 */
  readonly instanceId: string;
}

export function createHealthService(repository: HealthRepository, options: HealthOptions) {
  return {
    instanceId: options.instanceId,
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
