import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { parseId } from '../../utils/ids';
import { ok } from '../../utils/response';
import { requestSource } from '../../utils/source';
import { parseJson } from '../../utils/validate';
import type { AccessCodeService } from './service';
import { accessCodeInputSchema, accessSessionSchema } from './validator';

export interface AccessControllerOptions {
  /** 只有部署在可信反向代理之后才相信 X-Forwarded-For 作为输错计数的来源 */
  readonly trustProxy: boolean;
}

const codeId = (c: Context<AppEnv>) => parseId(c.req.param('id'));

/** 明文码只出现在创建和重新生成的响应里，不能被任何缓存留下 */
function noStore(c: Context<AppEnv>): void {
  c.header('Cache-Control', 'private, no-store');
}

export function createAdminAccessController(service: AccessCodeService) {
  return {
    list: async (c: Context<AppEnv>) => ok(c, await service.list()),
    create: async (c: Context<AppEnv>) => {
      noStore(c);
      return ok(c, await service.create(await parseJson(c, accessCodeInputSchema), c.get('admin').id), 201);
    },
    update: async (c: Context<AppEnv>) => ok(c, await service.update(codeId(c), await parseJson(c, accessCodeInputSchema))),
    regenerate: async (c: Context<AppEnv>) => {
      noStore(c);
      return ok(c, await service.regenerate(codeId(c)));
    },
    remove: async (c: Context<AppEnv>) => {
      await service.remove(codeId(c));
      return ok(c, null);
    },
  };
}

export function createPublicAccessController(service: AccessCodeService, options: AccessControllerOptions) {
  return {
    session: async (c: Context<AppEnv>) => {
      noStore(c);
      const { code } = await parseJson(c, accessSessionSchema);
      return ok(c, await service.createSession(code, requestSource(c, options.trustProxy)), 201);
    },
    me: async (c: Context<AppEnv>) => {
      noStore(c);
      return ok(c, await service.profile(c.get('access')));
    },
  };
}
