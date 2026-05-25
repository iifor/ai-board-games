import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getSkins(_req: Request, res: Response): void {
  res.json(formatSuccess(service.listSkins()));
}

function getSkin(req: Request<{ id: string }>, res: Response): void {
  res.json(formatSuccess(service.getSkin(req.params.id)));
}

function createSkin(req: Request, res: Response): void {
  res.status(201).json(formatSuccess(service.createSkin(req.body)));
}

function updateSkin(req: Request<{ id: string }>, res: Response): void {
  res.json(formatSuccess(service.updateSkin(req.params.id, req.body)));
}

function setSkinEnabled(req: Request<{ id: string }>, res: Response): void {
  res.json(formatSuccess(service.setSkinEnabled(req.params.id, (req.body as Record<string, unknown>).enabled as boolean)));
}

function deleteSkin(req: Request<{ id: string }>, res: Response): void {
  res.json(formatSuccess(service.deleteSkin(req.params.id)));
}

function importMarkdownSkins(_req: Request, res: Response): void {
  res.json(formatSuccess(service.importMarkdownSkins()));
}

function importSkinJson(req: Request, res: Response): void {
  res.json(formatSuccess(service.importSkinJson(req.body)));
}

export { getSkins, getSkin, createSkin, updateSkin, setSkinEnabled, deleteSkin, importMarkdownSkins, importSkinJson };
