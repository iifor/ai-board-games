import { Request, Response, NextFunction } from 'express';

function responseFormatter(_request: Request, response: Response, next: NextFunction): void {
  const originalJson = response.json.bind(response);

  response.json = function (body: unknown) {
    // Already formatted or error response
    if (body && typeof (body as Record<string, unknown>).code !== 'undefined' && typeof (body as Record<string, unknown>).message === 'string') {
      return originalJson(body);
    }

    // Wrap non-standard responses
    if (response.statusCode >= 200 && response.statusCode < 300) {
      const wrapped = { code: 0, message: '操作成功', data: body };
      return originalJson(wrapped);
    }

    return originalJson(body);
  };

  next();
}

export { responseFormatter };
