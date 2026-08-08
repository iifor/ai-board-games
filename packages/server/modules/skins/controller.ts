import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getSkins(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listSkins()));
}

async function getSkin(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getSkin(req.params.id)));
}

async function createSkin(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createSkin(req.body)));
}

async function updateSkin(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.json(formatSuccess(await service.updateSkin(req.params.id, req.body)));
}

async function setSkinEnabled(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.json(formatSuccess(await service.setSkinEnabled(req.params.id, (req.body as Record<string, unknown>).enabled as boolean)));
}

async function deleteSkin(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteSkin(req.params.id)));
}

async function importMarkdownSkins(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.importMarkdownSkins()));
}

async function importSkinJson(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.importSkinJson(req.body)));
}

export { getSkins, getSkin, createSkin, updateSkin, setSkinEnabled, deleteSkin, importMarkdownSkins, importSkinJson };
