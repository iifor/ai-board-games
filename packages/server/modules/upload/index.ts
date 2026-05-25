import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as service from './service';
import * as utils from './utils';
import * as constants from './constants';
import { formatSuccess } from '../../utils/response';

const router = Router();

router.post('/uploads/image', (request: Request, response: Response, next: NextFunction) => {
  try {
    const result = service.saveUploadedImage(request.body);
    response.json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
});

export { router };
export * from './service';
export * from './utils';
export * from './constants';
