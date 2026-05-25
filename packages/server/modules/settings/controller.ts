import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getSettings(_req: Request, res: Response): void {
  res.json(formatSuccess(service.getAppSettings()));
}

function setDefaultHost(req: Request, res: Response): void {
  res.json(formatSuccess(service.setDefaultHostPlayerId((req.body as Record<string, unknown>).defaultHostPlayerId)));
}

export { getSettings, setDefaultHost };
