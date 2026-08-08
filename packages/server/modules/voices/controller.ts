import { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getVoices(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listVoicePackages()));
}

async function getVoice(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getVoicePackage(req.params.id as string)));
}

async function createVoice(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createVoicePackage(req.body)));
}

async function updateVoice(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.updateVoicePackage(req.params.id as string, req.body)));
}

async function deleteVoice(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteVoicePackage(req.params.id as string)));
}

async function previewVoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.previewVoice(req.params.id as string, req.body?.text);
    res.set('Content-Type', result.mimeType || 'audio/mpeg');
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
}

export { getVoices, getVoice, createVoice, updateVoice, deleteVoice, previewVoice };
