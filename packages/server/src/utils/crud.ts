import { Hono, type Context } from 'hono';
import type { ZodType } from 'zod';
import type { AppEnv } from '../types';
import { parseId } from './ids';
import { ok } from './response';
import { parseJson } from './validate';

/** 资源型模块的标准服务接口 */
export interface CrudService<Input, Dto> {
  list(): Promise<Dto[]>;
  get(id: number): Promise<Dto>;
  create(input: Input): Promise<Dto>;
  update(id: number, input: Input): Promise<Dto>;
  remove(id: number): Promise<void>;
}

export interface CrudSchemas<Input> {
  readonly create: ZodType<Input>;
  readonly update: ZodType<Input>;
}

/** controller：只做参数解析、调用 service、包装响应 */
export function crudController<Input, Dto>(service: CrudService<Input, Dto>, schemas: CrudSchemas<Input>) {
  return {
    list: async (c: Context<AppEnv>) => ok(c, await service.list()),
    get: async (c: Context<AppEnv>) => ok(c, await service.get(parseId(c.req.param('id')))),
    create: async (c: Context<AppEnv>) => ok(c, await service.create(await parseJson(c, schemas.create)), 201),
    update: async (c: Context<AppEnv>) => ok(c, await service.update(parseId(c.req.param('id')), await parseJson(c, schemas.update))),
    remove: async (c: Context<AppEnv>) => {
      await service.remove(parseId(c.req.param('id')));
      return ok(c, null);
    },
  };
}

/** routes：标准 REST 路由绑定 */
export function crudRoutes(controller: ReturnType<typeof crudController>) {
  return new Hono<AppEnv>()
    .get('/', controller.list)
    .get('/:id', controller.get)
    .post('/', controller.create)
    .put('/:id', controller.update)
    .delete('/:id', controller.remove);
}
