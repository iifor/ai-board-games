import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError, ErrorCodes } from '../utils/errors';

function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const data = req[source];
    const result = schema.safeParse(data);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `参数校验失败：${messages}`, 400);
    }
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}

export { validate };
