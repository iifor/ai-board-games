import { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getVoices(_req: Request, res: Response): void {
  res.json(formatSuccess(service.listVoicePackages()));
}

function getVoice(req: Request, res: Response): void {
  res.json(formatSuccess(service.getVoicePackage(req.params.id as string)));
}

function createVoice(req: Request, res: Response): void {
  res.status(201).json(formatSuccess(service.createVoicePackage(req.body)));
}

function updateVoice(req: Request, res: Response): void {
  res.json(formatSuccess(service.updateVoicePackage(req.params.id as string, req.body)));
}

function deleteVoice(req: Request, res: Response): void {
  res.json(formatSuccess(service.deleteVoicePackage(req.params.id as string)));
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
